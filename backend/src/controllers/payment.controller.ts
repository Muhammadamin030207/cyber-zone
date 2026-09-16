import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';
import { io } from '../lib/socket';

// ============ YORDAMCHI: CASH to'lovda adminni xabardor qilish ============
async function notifyRoomOwner(ownerId: string, bookingId: string, amount: number) {
  await prisma.notification.create({
    data: {
      userId: ownerId,
      title: 'Yangi kassa to\'lovi kutilmoqda',
      message: `${amount} so'm miqdoridagi 30% to'lov kassada. Bronni tasdiqlashingiz kerak.`,
      type: 'payment',
    },
  });
  io.emit('notification_new', { userId: ownerId, type: 'payment' });
  io.to(`user:${ownerId}`).emit('notification_new', { userId: ownerId, type: 'payment' });
}

// ============ POST /api/payments/create — USER: to'lov yaratish ============
export const createPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId, amount, method } = req.body;

    if (!bookingId || !amount) {
      return badRequest(res, 'bookingId va amount majburiy');
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { room: true },
    });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res, 'Bu bron sizniki emas');
    if (booking.status === 'CANCELLED') return badRequest(res, 'Bekor qilingan bron uchun to\'lov mumkin emas');

    // Advance qancha to'langanligini hisoblaymiz
    const paidAdvance = await prisma.payment.aggregate({
      where: { bookingId, type: 'ADVANCE', status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const advanceOwed = Number(booking.advanceAmount.toString()) - (Number(paidAdvance._sum.amount || 0));
    const isAdvance = Number(amount) <= advanceOwed + 0.01;

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        userId: req.user!.userId,
        amount,
        type: isAdvance ? 'ADVANCE' : 'REMAINING',
        method: method || null,
        status: 'PENDING',
      },
    });

    // CASH to'lov — admin kassada qabul qiladi (xabarnoma yuboramiz)
    if (isAdvance && method === 'CASH') {
      await notifyRoomOwner(booking.room.ownerId, booking.id, Number(amount));
    }

    return created(res, payment, 'To\'lov yaratildi');
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/payments/:id/pay — USER: onlayn to'lovni simulyatsiya qilish ============
// Payme / Click / Uzcard / Humo — kartani "AI" avtomatik taniydi va to'lovni tasdiqlaydi
export const payOnline = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { cardNumber, cardHolder } = req.body || {};

    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { booking: { include: { room: true } } },
    });
    if (!payment) return notFoundMsg(res, 'To\'lov topilmadi');
    if (payment.userId !== req.user!.userId) return forbidden(res, 'Bu to\'lov sizniki emas');
    if (payment.status !== 'PENDING') return badRequest(res, 'Bu to\'lov allaqachon yakunlangan');

    const onlineMethods = ['PAYME', 'CLICK', 'UZCARD', 'HUMO', 'UZUM'];
    const method = payment.method as string;
    if (!method || !onlineMethods.includes(method)) {
      return badRequest(res, 'Kassa to\'lovi faqat admin tomonidan tasdiqlanadi');
    }

    // Karta validatsiyasi (simulyatsiya)
    const digits = (cardNumber || '').replace(/\s/g, '');
    if (digits && !/^\d+$/.test(digits)) {
      return badRequest(res, 'Karta raqami noto\'g\'ri');
    }

    // "AI" avtomatik tanib olish — simulyatsiya: har doim muvaffaqiyatli
    const transactionId = `TXN-${method}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const updated = await prisma.$transaction(async (tx) => {
      const paid = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
          transactionId,
        },
      });

      // Advance to'landi → bron tasdiqlanadi
      if (payment.type === 'ADVANCE') {
        const booking = await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: 'CONFIRMED' },
          include: { room: { select: { id: true, ownerId: true } } },
        });
        io.emit('booking_status_changed', { roomId: payment.booking.roomId, bookingId: payment.bookingId, type: 'CONFIRMED' });
        return { paid, booking };
      }
      return { paid, booking: null };
    });

    return ok(res, updated, 'To\'lov muvaffaqiyatli yakunlandi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments/:bookingId — USER: to'lov holati ============
export const getPaymentStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res);

    const payments = await prisma.payment.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'desc' },
    });

    const totalPaid = payments.filter((p) => p.status === 'COMPLETED').reduce((sum, p) => sum + Number(p.amount.toString()), 0);

    return ok(res, {
      bookingId: booking.id,
      totalPrice: booking.finalPrice,
      advanceAmount: booking.advanceAmount,
      advancePaid: payments.filter((p) => p.type === 'ADVANCE' && p.status === 'COMPLETED').reduce((s, p) => s + Number(p.amount.toString()), 0),
      remainingAmount: booking.remainingAmount,
      remainingPaid: payments.filter((p) => p.type === 'REMAINING' && p.status === 'COMPLETED').reduce((s, p) => s + Number(p.amount.toString()), 0),
      totalPaid,
      payments,
    });
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/payments/:id/confirm — ADMIN: CASH to'lov tasdiqlash ============
export const confirmPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { booking: { include: { room: true } } },
    });
    if (!payment) return notFoundMsg(res, 'To\'lov topilmadi');

    if (payment.booking.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res);
    }
    if (payment.status === 'COMPLETED') return badRequest(res, 'To\'lov allaqachon tasdiqlangan');

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
      },
    });

    // Advance to'lov to'langanda bronni CONFIRMED qilamiz
    if (payment.type === 'ADVANCE') {
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: 'CONFIRMED' },
      });
    }

    return ok(res, updated, 'To\'lov tasdiqlandi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/admin/payments — SUPER_ADMIN: barcha to'lovlar ============
export const getAllPayments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const payments = await prisma.payment.findMany({
      include: {
        booking: { select: { id: true, finalPrice: true, status: true, room: { select: { name: true } } } },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit) || 50,
      skip: Number(offset) || 0,
    });
    return ok(res, payments);
  } catch (err) {
    next(err);
  }
};