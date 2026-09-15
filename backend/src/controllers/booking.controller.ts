import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { io } from '../lib/socket';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';
import { Prisma } from '@prisma/client';

const BOOKING_INCLUDE = {
  user: { select: { id: true, fullName: true, phone: true, email: true } },
  room: { select: { id: true, name: true, address: true } },
  zone: { select: { id: true, name: true, type: true, pricePerHour: true } },
  computer: { select: { id: true, name: true, specs: true } },
  promoCode: { select: { id: true, code: true, discountType: true, discountValue: true } },
  payments: true,
};

// ============ YORDAMCHI: "HH:mm" → daqiqa ============
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ============ YORDAMCHI: vaqt to'qnashuvini tekshirish ============
// [start, end) — tugash vaqti yangi boshlanish vaqtiga teng bo'lsa ziddiyat emas
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);
  return aS < bE && bS < aE;
}

// ============ YORDAMCHI: narx hisoblash (Decimal xavfsiz) ============
function toNumber(v: any): number {
  return typeof v === 'object' && v !== null && typeof v.toString === 'function' ? Number(v.toString()) : Number(v);
}

// ============ POST /api/bookings — USER: yangi bron (himoya + transaction) ============
export const createBooking = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { roomId, zoneId, computerId, date, startTime, endTime, durationHours, notes, promoCode } = req.body;

    if (!roomId || !zoneId || !date || !startTime) {
      return badRequest(res, 'roomId, zoneId, date, startTime majburiy');
    }
    if (!endTime && !durationHours) {
      return badRequest(res, 'endTime yoki durationHours berilishi shart');
    }
    if (!endTime) {
      const startMin = timeToMinutes(startTime);
      const endMin = startMin + Math.round(toNumber(durationHours) * 60);
      if (endMin > 24 * 60) return badRequest(res, 'Bron 24:00 dan oshib ketyapti');
      const h = Math.floor(endMin / 60);
      const m = endMin % 60;
      //@ts-ignore
      endTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) return badRequest(res, 'Sana noto\'g\'ri');

    // Ish vaqti tekshiruvi
    const room = await prisma.computerRoom.findUnique({ where: { id: roomId } });
    if (!room) return notFoundMsg(res, 'Xona topilmadi');
    if (room.status !== 'ACTIVE') return badRequest(res, 'Xona faol emas');

    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.roomId !== roomId) return notFoundMsg(res, 'Zona topilmadi');

    const wh: any = room.workingHours || { open: '09:00', close: '23:00' };
    const open = wh.open || '09:00';
    const close = wh.close || '23:00';
    if (timeToMinutes(startTime) < timeToMinutes(open) || timeToMinutes(endTime as string) > timeToMinutes(close)) {
      return badRequest(res, `Ish vaqti: ${open} - ${close}`);
    }

    // Promo-kodni tekshirish (agar berilgan bo'lsa)
    let promo = null;
    if (promoCode) {
      promo = await prisma.promoCode.findUnique({ where: { code: String(promoCode).toUpperCase() } });
      if (!promo || !promo.isActive) return badRequest(res, 'Promo-kod topilmadi yoki nofaol');

      const now = new Date();
      if (now < promo.startsAt || now > promo.expiresAt) return badRequest(res, 'Promo-kod muddati tugagan');

      if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
        return badRequest(res, 'Promo-kod limiti tugagan');
      }
      if (promo.roomId && promo.roomId !== roomId) {
        return badRequest(res, 'Bu promo-kod boshqa xona uchun');
      }
    }

    // Transaktsiya: kompyuter lock + to'qnashuv tekshiruvi + yaratish
    try {
      const booking = await prisma.$transaction(async (tx) => {
        let selectedComputerId = computerId || null;

        if (selectedComputerId) {
          // Tanlangan kompyuterni lock qilamiz
          const locked: any[] = await tx.$queryRaw`SELECT id FROM computers WHERE id = ${selectedComputerId} FOR UPDATE`;
          if (locked.length === 0) throw new Error('COMPUTER_NOT_FOUND');

          const comp = await tx.computer.findUnique({
            where: { id: selectedComputerId },
            include: { zone: true },
          });
          if (!comp || comp.zoneId !== zoneId || comp.zone.roomId !== roomId) {
            throw new Error('COMPUTER_MISMATCH');
          }
          if (comp.status !== 'AVAILABLE') throw new Error('COMPUTER_BUSY');
        } else {
          // Avtomatik: bo'sh kompyuter tanlash
          const free = await tx.computer.findFirst({
            where: {
              zoneId,
              status: 'AVAILABLE',
              bookings: {
                none: {
                  date: bookingDate,
                  status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
                  AND: [
                    { startTime: { lt: endTime as string } },
                    { endTime: { gt: startTime } },
                  ],
                },
              },
            },
          });
          if (!free) throw new Error('NO_FREE_COMPUTER');
          selectedComputerId = free.id;
        }

        // To'qnashuvni aniq tekshirish (atomic)
        const conflictCount = await tx.booking.count({
          where: {
            computerId: selectedComputerId,
            date: bookingDate,
            status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
            AND: [
              { startTime: { lt: endTime as string } },
              { endTime: { gt: startTime } },
            ],
          },
        });
        if (conflictCount > 0) {
          const existing = await tx.booking.findFirst({
            where: {
              computerId: selectedComputerId,
              date: bookingDate,
              status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
              AND: [
                { startTime: { lt: endTime as string } },
                { endTime: { gt: startTime } },
              ],
            },
            select: { startTime: true, endTime: true },
          });
          throw new Error(`CONFLICT_${existing?.startTime}_${existing?.endTime}`);
        }

        // Narxni hisoblash
        const duration = toNumber(durationHours) || (timeToMinutes(endTime as string) - timeToMinutes(startTime)) / 60;
        const baseTotal = toNumber(zone.pricePerHour) * duration;

        // Chegirma
        let discount = 0;
        if (promo) {
          if (promo.discountType === 'PERCENTAGE') {
            discount = (baseTotal * toNumber(promo.discountValue)) / 100;
          } else {
            discount = toNumber(promo.discountValue);
          }
          if (toNumber(promo.minBookingAmount) && baseTotal < toNumber(promo.minBookingAmount)) {
            throw new Error('MIN_AMOUNT_NOT_REACHED');
          }
          discount = Math.min(discount, baseTotal);
        }

        const finalTotal = +(baseTotal - discount).toFixed(2);
        const advance = +(finalTotal * 0.3).toFixed(2);
        const remaining = +(finalTotal * 0.7).toFixed(2);

        const newBooking = await tx.booking.create({
          data: {
            userId: req.user!.userId,
            roomId,
            zoneId,
            computerId: selectedComputerId,
            promoCodeId: promo ? promo.id : null,
            date: bookingDate,
            startTime,
            endTime: endTime as string,
            durationHours: duration,
            totalPrice: baseTotal,
            discountAmount: discount,
            finalPrice: finalTotal,
            advanceAmount: advance,
            remainingAmount: remaining,
            status: 'PENDING',
            notes,
          },
          include: BOOKING_INCLUDE,
        });

        // Promo-kod count +1
        if (promo) {
          await tx.promoCode.update({
            where: { id: promo.id },
            data: { usedCount: { increment: 1 } },
          });
        }

        return newBooking;
      });

      // Socket — real vaqt yangilanish
      io.emit('booking_status_changed', { roomId, type: 'new_booking' });

      return created(res, booking, 'Bron yaratildi. 30% oldindan to\'lov kerak');
    } catch (txErr: any) {
      const msg = txErr.message || '';
      if (msg === 'COMPUTER_NOT_FOUND') return notFoundMsg(res, 'Kompyuter topilmadi');
      if (msg === 'COMPUTER_MISMATCH') return badRequest(res, 'Kompyuter zona/xonaga mos emas');
      if (msg === 'COMPUTER_BUSY') return badRequest(res, 'Bu kompyuter hozirda band');
      if (msg === 'NO_FREE_COMPUTER') return badRequest(res, 'Ushbu vaqt uchun bo\'sh kompyuter yo\'q');
      if (msg === 'MIN_AMOUNT_NOT_REACHED') return badRequest(res, 'Promo-kod uchun minimal narx yetishmayapti');
      if (msg.startsWith('CONFLICT_')) {
        const [, s, e] = msg.split('_');
        return badRequest(res, `Bu kompyuter ${s} - ${e} vaqtda band`);
      }
      throw txErr;
    }
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/bookings — USER: o'z bronlari ============
export const getMyBookings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.userId },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, bookings);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/bookings/:id — USER: bitta bron ============
export const getBookingById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: BOOKING_INCLUDE,
    });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res, 'Bu bron sizniki emas');
    return ok(res, booking);
  } catch (err) {
    next(err);
  }
};

// ============ PUT /api/bookings/:id/cancel — USER: bronni bekor qilish ============
export const cancelBooking = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res, 'Bu bron sizniki emas');

    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      return badRequest(res, 'Bu bron o\'zgartirib bo\'lmaydi');
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
    });

    // Promo-kod count'ni qaytarish
    if (booking.promoCodeId) {
      await prisma.promoCode.update({
        where: { id: booking.promoCodeId },
        data: { usedCount: { decrement: 1 } },
      });
    }

    // Socket — real vaqt
    io.emit('booking_status_changed', { roomId: booking.roomId, type: 'cancelled' });

    return ok(res, updated, 'Bron bekor qilindi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/admin/bookings — ADMIN: xona bronlari ============
export const getRoomBookings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { date, status, limit, offset } = req.query as { date?: string; status?: string; limit?: string; offset?: string };

    const room = await prisma.computerRoom.findUnique({ where: { ownerId: req.user!.userId } });
    if (!room) return badRequest(res, 'Sizda kompyuter xona yo\'q');
    if (req.user!.role === 'ADMIN' && room.ownerId !== req.user!.userId) {
      return forbidden(res);
    }

    const where: any = { roomId: room.id };
    if (date) where.date = new Date(date);
    if (status) where.status = status.toUpperCase();

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: BOOKING_INCLUDE,
        orderBy: { date: 'desc' },
        take: Number(limit) || 100,
        skip: Number(offset) || 0,
      }),
      prisma.booking.count({ where }),
    ]);

    return ok(res, { bookings, total });
  } catch (err) {
    next(err);
  }
};

// ============ PATCH /api/admin/bookings/:id/status — ADMIN: tasdiqlash/rad etish ============
export const updateBookingStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'ACTIVE'];
    if (!status || !allowedStatuses.includes(status.toUpperCase())) {
      return badRequest(res, `Status: ${allowedStatuses.join(', ')} bo\'lishi kerak`);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');

    if (booking.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res, 'Faqat o\'z xonangiz bronlarini boshqarasiz');
    }

    // Agar bron CANCELLED bo'lsa, kompyuterni bo'shatamiz
    if (status.toUpperCase() === 'CANCELLED' && booking.computerId) {
      await prisma.computer.update({
        where: { id: booking.computerId },
        data: { status: 'AVAILABLE' },
      });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: status.toUpperCase() },
      include: BOOKING_INCLUDE,
    });

    // Socket — real vaqt
    io.emit('booking_status_changed', { roomId: booking.roomId, bookingId: booking.id, type: status.toUpperCase() });

    return ok(res, updated, `Bron: ${status}`);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/rooms/:roomId/availability — PUBLIC: bo'sh kompyuterlar vaqti ============
export const getAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query as { date?: string };
    const availabilityDate = date ? new Date(date) : new Date();

    const room = await prisma.computerRoom.findUnique({
      where: { id: req.params.roomId },
      include: { zones: { include: { computers: true } } },
    });
    if (!room) return notFoundMsg(res, 'Xona topilmadi');

    // Har bir zona uchun: jami kompyuterlar, band bo'lganlari, bo'shlari
    const zones = [];
    for (const zone of room.zones) {
      const bookedComputers = await prisma.booking.findMany({
        where: {
          zoneId: zone.id,
          date: availabilityDate,
          status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
        },
        select: { computerId: true },
        distinct: ['computerId'],
      });
      const bookedIds = new Set(bookedComputers.map((b) => b.computerId).filter(Boolean));
      const availableComputers = zone.computers.filter((c) => c.status === 'AVAILABLE' && !bookedIds.has(c.id));

      zones.push({
        id: zone.id,
        name: zone.name,
        type: zone.type,
        pricePerHour: zone.pricePerHour,
        totalComputers: zone.computers.length,
        bookedComputers: bookedIds.size,
        availableComputers: availableComputers.length,
        computers: availableComputers.map((c) => ({ id: c.id, name: c.name, specs: c.specs })),
      });
    }

    return ok(res, { date: availabilityDate.toISOString().slice(0, 10), zones });
  } catch (err) {
    next(err);
  }
};