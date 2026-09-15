import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';

async function getMyRoom(req: AuthRequest, res: Response) {
  if (req.user!.role === 'SUPER_ADMIN') return null; // Super admin platform-wide yaratadi
  const room = await prisma.computerRoom.findUnique({ where: { ownerId: req.user!.userId } });
  if (!room) {
    badRequest(res, 'Sizda kompyuter xona yo\'q');
    return undefined;
  }
  return room;
}

// ============ GET /api/admin/promos — ADMIN: o'z promo-kodlari ============
export const getMyPromos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const room = await getMyRoom(req, res);
    if (room === undefined) return;

    const promos = await prisma.promoCode.findMany({
      where: room ? { roomId: room.id } : {},
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, promos);
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/admin/promos — ADMIN: yangi promo-kod ============
export const createPromo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, discountType, discountValue, minBookingAmount, maxUses, startsAt, expiresAt } = req.body;

    if (!code || !discountType || !discountValue || !expiresAt) {
      return badRequest(res, 'code, discountType, discountValue, expiresAt majburiy');
    }

    const room = await getMyRoom(req, res);
    if (room === undefined) return;

    // Unique kod uchun check
    const exists = await prisma.promoCode.findUnique({ where: { code: String(code).toUpperCase() } });
    if (exists) return badRequest(res, 'Bunday kod allaqachon mavjud');

    const promo = await prisma.promoCode.create({
      data: {
        roomId: room ? room.id : null,
        code: String(code).toUpperCase(),
        discountType: String(discountType).toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
        discountValue,
        minBookingAmount: minBookingAmount || null,
        maxUses: maxUses !== undefined && maxUses !== null ? Number(maxUses) : null,
        startsAt: startsAt ? new Date(startsAt) : new Date(),
        expiresAt: new Date(expiresAt),
        createdBy: req.user!.userId,
      },
    });

    return created(res, promo, 'Promo-kod yaratildi');
  } catch (err) {
    next(err);
  }
};

// ============ PATCH /api/admin/promos/:id — ADMIN: tahrirlash ============
export const updatePromo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const promo = await prisma.promoCode.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!promo) return notFoundMsg(res, 'Promo-kod topilmadi');

    const isOwnerAdmin = promo.room && promo.room.ownerId === req.user!.userId;
    const isPlatformWide = !promo.room && req.user!.role === 'SUPER_ADMIN';
    if (!isOwnerAdmin && !isPlatformWide) return forbidden(res);

    const { discountType, discountValue, minBookingAmount, maxUses, startTime, expiresAt, isActive } = req.body;

    const data: any = {};
    if (discountType !== undefined) data.discountType = discountType.toUpperCase();
    if (discountValue !== undefined) data.discountValue = discountValue;
    if (minBookingAmount !== undefined) data.minBookingAmount = minBookingAmount;
    if (maxUses !== undefined) data.maxUses = maxUses;
    if (expiresAt !== undefined) data.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await prisma.promoCode.update({
      where: { id: req.params.id },
      data,
    });

    return ok(res, updated, 'Promo-kod yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/admin/promos/:id — ADMIN: o'chirish ============
export const deletePromo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const promo = await prisma.promoCode.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!promo) return notFoundMsg(res, 'Promo-kod topilmadi');

    const isOwnerAdmin = promo.room && promo.room.ownerId === req.user!.userId;
    const isPlatformWide = !promo.room && req.user!.role === 'SUPER_ADMIN';
    if (!isOwnerAdmin && !isPlatformWide) return forbidden(res);

    await prisma.promoCode.delete({ where: { id: req.params.id } });
    return ok(res, null, 'Promo-kod o\'chirildi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/promo/check?code=&room_id= — USER: kodni tekshirish ============
export const checkPromo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, room_id } = req.query as { code?: string; room_id?: string };
    if (!code) return badRequest(res, 'code kerak');

    const normalized = String(code).toUpperCase();
    // Ma'lumot ochish uchun muhim emas — faqat kod validligi
    const promo = await prisma.promoCode.findUnique({ where: { code: normalized } });
    if (!promo || !promo.isActive) return badRequest(res, 'Promo-kod topilmadi yoki nofaol');

    const now = new Date();
    if (now < promo.startsAt || now > promo.expiresAt) return badRequest(res, 'Promo-kod muddati tugagan');
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return badRequest(res, 'Promo-kod limiti tugagan');

    if (room_id && promo.roomId && promo.roomId !== room_id) {
      return badRequest(res, 'Bu promo-kod boshqa xona uchun');
    }

    return ok(res, {
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      minBookingAmount: promo.minBookingAmount,
      expiresAt: promo.expiresAt,
    }, 'Promo-kod yaroqli');
  } catch (err) {
    next(err);
  }
};