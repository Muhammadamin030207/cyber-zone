import { Request, Response, NextFunction } from 'express';
import { AuthRequest, JwtPayload } from '../types';
import { verifyAccessToken } from '../lib/jwt';
import prisma from '../lib/prisma';

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token topilmadi' });
    }

    const token = header.split(' ')[1];
    const decoded: JwtPayload = verifyAccessToken(token);

    // Token faqat token emas — foydalanuvchi hali ham mavjud va faol ekanini tekshiramiz
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'Foydalanuvchi bloklangan' });
    }

    // Server-side sessiya bekor qilish: logout/parol o'zgarishidan keyin eski
    // tokenlardan foydalanib bo'lmaydi (tokenVersion mos kelmasa rad etiladi).
    if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Sessiya tugagan. Iltimos, qaytadan kiring.', code: 'SESSION_INVALIDATED' });
    }

    req.user = {
      userId: user.id,
      email: decoded.email,
      role: user.role as JwtPayload['role'],
      tokenVersion: user.tokenVersion,
    };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token yaroqsiz yoki muddati otgan' });
  }
}

/**
 * Ixtiyoriy autentifikatsiya — token BO'LSA `req.user` to'ldiriladi, yo'q
 * yoki yaroqsiz bo'lsa so'rov davom etadi (401 bermaydi).
 *
 * Qachon kerak: ommaviy frontend yo'llari (masalan `GET /api/promo/check`)
 * kirishsiz ham ishlashi kerak, lekin token yuborilganda shaxsiy ma'lumot
 * (shaxsiy limit, "allaqachon ishlatilgan") tekshirilishi kerak. To'liq
 * `authenticate` bu yerda noto'g'ri — u kirishsiz foydalanuvchini rad etar,
 * `checkPromo` esa `req.user` yo'qligi sabab per-user limitni HECH QACHON
 * ishga tushirmaydi (limit "yaroqli", keyin booking paytida "limit tugagan").
 */
export async function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  // `authenticate` barcha muvaffaqiyatsiz holatlarda 401 qaytaradi — biz u
  // yerda javobni yuborib tugatmasligimiz kerak, shuning uchun o'zimiz
  // tekshiramiz va har qanday xatoni "jimgina o'tkazib yuboramiz".
  try {
    const decoded: JwtPayload = verifyAccessToken(header.split(' ')[1]);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
    // Bloklangan yoki eskirgan sessiya — foydalanuvchi sifatida hisobga
    // olmaymiz (lekin so'rov ham rad etilmaydi).
    if (user && user.status === 'ACTIVE' && (decoded.tokenVersion ?? 0) === user.tokenVersion) {
      req.user = {
        userId: user.id,
        email: decoded.email,
        role: user.role as JwtPayload['role'],
        tokenVersion: user.tokenVersion,
      };
    }
  } catch {
    // Token yaroqsiz — davom etamiz, `req.user` bo'sh qoladi.
  }
  next();
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Avtentifikatsiya talab qilinadi' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Ruxsat yoq' });
    }
    next();
  };
}