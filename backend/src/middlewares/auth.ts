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