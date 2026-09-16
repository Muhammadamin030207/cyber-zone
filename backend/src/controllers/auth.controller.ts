import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { generateTokens, verifyRefreshToken } from '../lib/jwt';
import { config } from '../config';
import { AuthRequest } from '../types';
import { ok, badRequest, unauthorized, notFoundMsg } from '../utils/response';

const googleClient = new OAuth2Client(config.google.clientId);

// ============ REGISTER (USER) ============
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, fullName, phone, language } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest(res, 'Bunday email allaqachon ro\'yxatdan o\'tgan');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
        language: language || 'uz',
        role: 'USER',
      },
    });

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return ok(res, { user: sanitizeUser(user), ...tokens }, 'Ro\'yxatdan muvaffaqiyatli o\'tdingiz');
  } catch (err) {
    next(err);
  }
};

// ============ LOGIN ============
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return badRequest(res, 'Email yoki parol noto\'g\'ri');

    if (!user.passwordHash) return badRequest(res, 'Ushbu akkaunt Google orqali yaratilgan');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return badRequest(res, 'Email yoki parol noto\'g\'ri');

    if (user.status === 'BLOCKED') return unauthorized(res, 'Akkauntingiz bloklangan');

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return ok(res, { user: sanitizeUser(user), ...tokens }, 'Xush kelibsiz!');
  } catch (err) {
    next(err);
  }
};

// ============ GOOGLE OAUTH ============
export const googleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) return badRequest(res, 'Google token talab qilinadi');

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: config.google.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload) return badRequest(res, 'Token yaroqsiz');

    const { email, sub: googleId, name, email_verified, picture } = payload;

    if (!email_verified) return badRequest(res, 'Email tasdiqlanmagan');

    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      // googleId bo'yicha topilmasa, email bo'yicha qidiramiz
      user = await prisma.user.findUnique({ where: { email: email! } });

      if (user) {
        // Mavjud user ga google_id va avatarni biriktiramiz
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            avatarUrl: user.avatarUrl || picture || null,
            fullName: user.fullName || name || email!.split('@')[0],
          },
        });
      } else {
        // Yangi foydalanuvchi: Google ma'lumotlari bilan to'g'ridan-to'g'ri hisob yaratamiz
        user = await prisma.user.create({
          data: {
            email: email!,
            googleId,
            fullName: name || email!.split('@')[0] || 'Foydalanuvchi',
            avatarUrl: picture || null,
            role: 'USER',
            language: 'uz',
            status: 'ACTIVE',
          },
        });
      }
    }

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return ok(res, { user: sanitizeUser(user), ...tokens }, 'Google orqali muvaffaqiyatli kirdingiz');
  } catch (err) {
    next(err);
  }
};

// ============ REFRESH TOKEN ============
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return badRequest(res, 'Refresh token talab qilinadi');

    const decoded = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
    if (user.status === 'BLOCKED') return unauthorized(res, 'Akkauntingiz bloklangan');

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return ok(res, tokens, 'Token yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ GET ME ============
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        computerRoom: {
          include: { zones: { include: { computers: true } } },
        },
      },
    });
    if (!user) return notFoundMsg(res, 'Foydalanuvchi topilmadi');

    return ok(res, sanitizeUser(user));
  } catch (err) {
    next(err);
  }
};

// ============ UPDATE PROFILE ============
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fullName, phone, language, avatarUrl } = req.body;

    const data: any = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (phone !== undefined) data.phone = phone;
    if (language !== undefined) data.language = language;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
    });

    return ok(res, sanitizeUser(user), 'Profil yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ CHANGE PASSWORD ============
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return notFoundMsg(res, 'Foydalanuvchi topilmadi');

    if (!user.passwordHash) return badRequest(res, 'Ushbu akkaunt Google orqali yaratilgan');

    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) return badRequest(res, 'Eski parol noto\'g\'ri');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return ok(res, null, 'Parol muvaffaqiyatli o\'zgartirildi');
  } catch (err) {
    next(err);
  }
};

function sanitizeUser(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}