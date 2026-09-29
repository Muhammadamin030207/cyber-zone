import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';
import { getPromoIdentityIds, isPromoRecipient } from '../utils/promoIdentity';

async function getMyRoom(req: AuthRequest, res: Response) {
  if (req.user!.role === 'SUPER_ADMIN') return null; // Super admin platform-wide yaratadi
  const room = await prisma.computerRoom.findUnique({ where: { ownerId: req.user!.userId } });
  if (!room) {
    badRequest(res, 'Sizda kompyuter xona yo\'q');
    return undefined;
  }
  return room;
}

/** usageScope validatsiyasi: SINGLE_USE | USER_LIMITED | MULTI_USE (default SINGLE_USE) */
function normalizeScope(value: unknown): 'SINGLE_USE' | 'USER_LIMITED' | 'MULTI_USE' {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'USER_LIMITED' || v === 'MULTI_USE') return v;
  return 'SINGLE_USE';
}

/**
 * Per-account ishlatish sonini (1|2|N) normalashtiradi. Chegara 1..20.
 * Berilmagan bo'lsa — 1 (mavjud default xatti-harakat saqlanadi).
 */
function normalizeLimitPerUser(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

/**
 * Shaxsiy (personal) promo-kod sozlamalarini yig'adi. Kamida bitta identifikator
 * (recipientUserId | recipientPhone | recipientEmail) majburiy; IP EMAS ishlatiladi.
 * return undefined bo'lsa — invalidatsiya xatosi bor.
 */
function collectPersonalFields(body: any): {
  data?: { isPersonal: boolean; recipientUserId: string | null; recipientPhone: string | null; recipientEmail: string | null };
  error?: string;
} {
  if (body.isPersonal === undefined && body.recipientUserId === undefined && body.recipientPhone === undefined && body.recipientEmail === undefined) {
    return { data: undefined };
  }
  const recipientUserId = body.recipientUserId ? String(body.recipientUserId).trim() : null;
  const recipientPhone = body.recipientPhone ? String(body.recipientPhone).trim() : null;
  const recipientEmail = body.recipientEmail ? String(body.recipientEmail).trim().toLowerCase() : null;
  const isPersonal = Boolean(
    body.isPersonal ?? recipientUserId ?? recipientPhone ?? recipientEmail
  );
  if (isPersonal && !recipientUserId && !recipientPhone && !recipientEmail) {
    return { error: 'Shaxsiy promo-kod uchun recipientUserId, recipientPhone yoki recipientEmail majburiy (IP qabul qilinmaydi)' };
  }
  return { data: { isPersonal, recipientUserId, recipientPhone, recipientEmail } };
}

/**
 * Promo-kodning HOLLIK (holati) — admin ro'yxati uchun.
 * `isActive` bilan aralashmasligi kerak: kod `isActive=true` bo'lishi mumkin,
 * lekin muddati o'tgan yoki boshlangan bo'lsa — allaqachon ishlatib bo'lmaydi.
 */
function promoStatus(p: { isActive: boolean; startsAt: Date; expiresAt: Date; usedCount: number; maxUses: number | null; usageScope: string }, now: Date): string {
  if (now > p.expiresAt) return 'EXPIRED';
  if (now < p.startsAt) return 'NOT_STARTED';
  if (!p.isActive) return 'INACTIVE';
  const unlimited = p.maxUses === null || p.usageScope === 'MULTI_USE';
  if (!unlimited && p.maxUses !== null && p.usedCount >= p.maxUses) return 'USED_UP';
  return 'ACTIVE';
}

// ============ GET /api/admin/promos — ADMIN: o'z promo-kodlari ============
/**
 * MUDDATI O'TGAN KODLAR RO'YXATDA KO'RINMAYDI (default).
 * Sabab: admin panelida eskirgan kodlar aralashib, "nega ishlamayapti?"
 * degan chalkashlik keltiradi — va xato bilan qayta ishlatilishi mumkin.
 * Tarix/tekshiruv uchun `?include_expired=1` bilan ko'riladi (O'CHIRILMAYDI —
 * hisob uchun saqlanadi).
 */
export const getMyPromos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const room = await getMyRoom(req, res);
    if (room === undefined) return;

    const now = new Date();
    const includeExpired = ['1', 'true', 'yes'].includes(
      String((req.query as Record<string, unknown>).include_expired || '').toLowerCase(),
    );

    const promos = await prisma.promoCode.findMany({
      where: {
        ...(room ? { roomId: room.id } : {}),
        ...(includeExpired ? {} : { expiresAt: { gte: now } }),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Decimal -> oddiy son (frontend JSON'ni oldini oladi)
    return ok(
      res,
      promos.map((p) => ({
        ...p,
        discountValue: Number(p.discountValue),
        minBookingAmount: p.minBookingAmount === null ? null : Number(p.minBookingAmount),
        status: promoStatus(p, now),
        expiresInMinutes: Math.max(0, Math.floor((p.expiresAt.getTime() - now.getTime()) / 60000)),
      })),
    );
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

    // Promo-kodlar kamida 100 000 so'mlik bronlarga qo'llanadi (abuse himoyasi).
    // Admin pastroq qiymat bersa ham yoki umuman bermasa ham -> 100 000.
    let minBooking = Number(minBookingAmount);
    if (!Number.isFinite(minBooking) || minBooking < 100_000) minBooking = 100_000;

    const personal = collectPersonalFields(req.body);
    if (personal.error) return badRequest(res, personal.error);

    const promo = await prisma.promoCode.create({
      data: {
        roomId: room ? room.id : null,
        code: String(code).toUpperCase(),
        discountType: String(discountType).toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
        discountValue,
        minBookingAmount: minBooking,
        usageScope: normalizeScope(req.body.usageScope),
        maxUses: maxUses !== undefined && maxUses !== null ? Number(maxUses) : null,
        usageLimitPerUser: normalizeLimitPerUser(req.body.usageLimitPerUser),
        ...(personal.data || {}),
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

    const { discountType, discountValue, minBookingAmount, usageScope, maxUses, startTime, expiresAt, isActive } = req.body;

    const data: any = {};
    if (discountType !== undefined) data.discountType = discountType.toUpperCase();
    if (discountValue !== undefined) data.discountValue = discountValue;
    if (minBookingAmount !== undefined) {
      const min = Number(minBookingAmount);
      data.minBookingAmount = Number.isFinite(min) && min >= 100_000 ? min : 100_000;
    }
    if (usageScope !== undefined) data.usageScope = normalizeScope(usageScope);
    if (maxUses !== undefined) data.maxUses = maxUses;
    if (req.body.usageLimitPerUser !== undefined) data.usageLimitPerUser = normalizeLimitPerUser(req.body.usageLimitPerUser);
    const personal = collectPersonalFields(req.body);
    if (personal.error) return badRequest(res, personal.error);
    if (personal.data !== undefined) Object.assign(data, personal.data);
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

// ============ GET /api/promo/my — USER: shaxsiy va yaroqli promo-kodlar ============
export const getMyPromosUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, phone: true, email: true },
    });
    const identityIds = await getPromoIdentityIds(prisma, req.user!.userId);
    const now = new Date();

    // Barcha aktiv, amal qiluvchi promo-kodlar; shaxsiy bo'lsa — faqat o'zim uchun.
    const candidates = await prisma.promoCode.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        expiresAt: { gte: now },
        AND: [
          // Shaxsiy bo'lsa — faqat o'zim uchun.
          {
            OR: [
              { isPersonal: false },
              { isPersonal: true, recipientUserId: { in: identityIds } },
              { isPersonal: true, recipientPhone: user?.phone || '' },
              { isPersonal: true, recipientEmail: user?.email.toLowerCase() || '' },
            ],
          },
          // Jami limit: cheksiz yoki hali tugamagan.
          // `prisma.promoCode.fields.maxUses` — Prisma field-reference API:
          // `usedCount < maxUses` ni bitta SQL shartga aylantiradi (boshqa
          // ustun bilan solishtirish WHERE ichida ifoda qilinmaydi, shuning
          // uchun JS'da filtrlash kerak edi — lekin bu filtr DB'dan KEYIN
          // kelar edi va o'sha "yakuniy" filtr butunlay o'lik kod bo'lib
          // qolardi: `maxUses: 100` lekin `usageScope: SINGLE_USE` kod
          // hech qachon foydalanuvchiga ko'rinmasdi).
          { OR: [{ maxUses: null }, { usageScope: 'MULTI_USE' }, { usedCount: { lt: prisma.promoCode.fields.maxUses } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Har bir kod uchun o'zim necha marta ishlatganimni hisoblaymiz
    const promos = await Promise.all(
      candidates
        .filter((p) => {
          if (!p.isPersonal) return true;
          return isPromoRecipient(p, {
            userId: req.user!.userId,
            phone: user?.phone,
            email: user?.email,
            identityIds,
          });
        })
        .map(async (p) => {
          const usedByMe = await prisma.booking.count({
            where: { userId: { in: identityIds }, promoCodeId: p.id, status: { not: 'CANCELLED' } },
          });
          const remaining = Math.max(0, (p.usageLimitPerUser ?? 1) - usedByMe);
          return {
            id: p.id,
            code: p.code,
            discountType: p.discountType,
            discountValue: p.discountValue,
            minBookingAmount: p.minBookingAmount,
            usageLimitPerUser: p.usageLimitPerUser,
            isPersonal: p.isPersonal,
            expiresAt: p.expiresAt,
            usedByMe,
            remaining,
            usable: remaining > 0,
          };
        })
    );

    return ok(res, promos.filter((x) => x.usable));
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/promo/check?code=&room_id= — USER: kodni tekshirish ============
export const checkPromo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, room_id } = req.query as { code?: string; room_id?: string };
    if (!code) return badRequest(res, 'code kerak');

    const normalized = String(code).toUpperCase();
    // Ma'lumot ochish uchun muhim emas — faqat kod validligi
    const promo = await prisma.promoCode.findUnique({ where: { code: normalized } });
    if (!promo) return badRequest(res, 'Promokod topilmadi.', 'PROMO_NOT_FOUND');
    // Nofaol kod "topilmadi" emas — kod bor, faqat admin o'chirgan. Xabarni
    // ajratamiz: mijoz nima uchun ishlamayotganini tushsin.
    if (!promo.isActive) return badRequest(res, 'Bu promokod nofaol.', 'PROMO_INACTIVE');

    const now = new Date();
    if (now < promo.startsAt || now > promo.expiresAt) {
      return badRequest(res, "Promokodning muddati tugagan.", 'PROMO_EXPIRED');
    }
    // MULTI_USE: jami limit yo'q (faqat per-user unique constraint). Boshqa scope'da
    // maxUses hali jami sifatida cheklanadi.
    if (promo.usageScope !== 'MULTI_USE' && promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return badRequest(res, 'Bu promokodning umumiy limiti tugagan.', 'PROMO_GLOBAL_LIMIT');
    }

    if (room_id && promo.roomId && promo.roomId !== room_id) {
      return badRequest(res, 'Bu promo-kod boshqa xona uchun', 'PROMO_WRONG_ROOM');
    }

    // Per-account limitni HAM shu yerda tekshiramiz. Aks holda foydalanuvchi
    // "yaroqli" deb ko'rib, keyin booking paytida "limit tugagan" xatosini
    // olardi — bu hisob kitobi chalkashligining asosiy sababi (§20).
    // Autentifikatsiyalangan bo'lsa, shaxsiy "twin" akkauntlar ham hisobga olinadi.
    const authed = (req as AuthRequest).user;
    if (authed?.userId) {
      const identityIds = await getPromoIdentityIds(prisma, authed.userId);
      const usedByIdentity = await prisma.booking.count({
        where: { userId: { in: identityIds }, promoCodeId: promo.id, status: { not: 'CANCELLED' } },
      });
      if (usedByIdentity >= (promo.usageLimitPerUser ?? 1)) {
        return badRequest(
          res,
          promo.isPersonal
            ? "Shaxsiy promo-kodingizning limiti tugagan."
            : "Bu promokodning foydalanish limiti tugagan.",
          promo.isPersonal ? 'PROMO_PERSONAL_LIMIT' : 'PROMO_USER_LIMIT',
        );
      }
    }

    return ok(res, {
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      minBookingAmount: promo.minBookingAmount,
      usageScope: promo.usageScope,
      usageLimitPerUser: promo.usageLimitPerUser,
      // Shaxsiy limit tekshirildimi? Frontend shu qiymatga qarab
      // xabarni aniq ko'rsatadi: `false` bo'lsa "siz allaqachon ishlatgansiz"
      // degani tekshirilMAGAN — umumiy ma'lumot. Kiritishsiz chaqiruvda
      // `req.user` yo'q, shuning uchun `false`.
      personalLimitChecked: Boolean(authed?.userId),
      isPersonal: promo.isPersonal,
      expiresAt: promo.expiresAt,
    }, 'Promo-kod yaroqli');
  } catch (err) {
    next(err);
  }
};