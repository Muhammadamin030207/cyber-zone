import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { generateTokens, verifyRefreshToken } from '../lib/jwt';
import { config } from '../config';
import { AuthRequest } from '../types';
import { ok, badRequest, unauthorized, notFoundMsg } from '../utils/response';
import { sendEmail, buildResetEmail } from '../lib/mailer';

const googleClient = new OAuth2Client(config.google.clientId);

/** Telefon raqamni yagona formaga keltiradi: "+998 90 123 45 67" yoki "998901234567" -> "+998901234567" */
function normalizePhone(p: string): string | null {
  const digits = String(p).replace(/\D/g, '');
  if (/^998\d{9}$/.test(digits)) return '+998' + digits.slice(3);
  if (/^\d{9}$/.test(digits)) return '+998' + digits;
  return null;
}

// ============ REGISTER (USER) ============
// googleToken berilganda parvoz qilib, parol ixtiyoriy (avtomatik random parol qo'yiladi)
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, phone, language, googleToken } = req.body;
    let fullName = String(req.body.fullName || '').trim();

    if (!email) {
      return badRequest(res, 'email majburiy');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return badRequest(res, "Email noto'g'ri formatda");
    }
    if (password && String(password).length < 6) {
      return badRequest(res, "Parol kamida 6 ta belgidan iborat bo'lishi kerak");
    }
    const phoneNorm = phone ? normalizePhone(String(phone)) : null;
    if (phone !== undefined && phone !== null && phone !== '' && !phoneNorm) {
      return badRequest(res, "Telefon +998 XX XXX XX XX formatda bo'lishi kerak");
    }

    // Google orqali kelgan holatda token tekshiriladi va google_id biriktiriladi.
    // Ism (fullName) Gmail profilidan olinadi — foydalanuvchi faqat telefon qo'shadi.
    let googleId: string | null = null;
    let avatarUrl: string | null = null;
    if (googleToken) {
      const ticket = await googleClient.verifyIdToken({
        idToken: String(googleToken),
        audience: config.google.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email_verified) {
        return badRequest(res, 'Google token yaroqsiz');
      }
      if (payload.email && payload.email !== String(email)) {
        return badRequest(res, "Email Google profili bilan mos kelmaydi");
      }
      googleId = payload.sub;
      avatarUrl = payload.picture || null;
      const payloadName =
        [payload.given_name, payload.family_name].filter(Boolean).join(' ').trim() ||
        payload.name || '';
      fullName = fullName || payloadName;
    }

    if (fullName.length < 3) {
      return badRequest(res, "Ism kamida 3 ta belgidan iborat bo'lishi kerak");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest(res, 'Bunday email allaqachon ro\'yxatdan o\'tgan');

    // Parol: berilsa hashlanadi, Google orqali bo'lsa random parol
    let passwordHash: string;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    } else if (googleId) {
      passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    } else {
      return badRequest(res, 'Parol talab qilinadi');
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone: phoneNorm || null,
        language: language || 'uz',
        role: 'USER',
        googleId,
        avatarUrl,
      },
    });

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return ok(
      res,
      {
        user: sanitizeUser(user),
        ...tokens,
        isNewUser: true,
        profile: { fullName, email, phone: user.phone || null },
      },
      'Ro\'yxatdan muvaffaqiyatli o\'tdingiz'
    );
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

    const {
      email,
      sub: googleId,
      name,
      given_name,
      family_name,
      email_verified,
      picture,
    } = payload;

    // Ism (given) va familiya (family) alohida olinadi — "Ism Familiya" formatida saqlanadi
    const fullName = [given_name, family_name].filter(Boolean).join(' ').trim() || name || email!.split('@')[0] || 'Foydalanuvchi';

    if (!email_verified) return badRequest(res, 'Email tasdiqlanmagan');

    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      // googleId bo'yicha topilmasa, email bo'yicha qidiramiz
      user = await prisma.user.findUnique({ where: { email: email! } });

      if (user) {
        // Mavjud user ga google_id va avatarni biriktiramiz (agar bo'sh bo'lsa)
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            avatarUrl: user.avatarUrl || picture || null,
            fullName: !user.fullName || user.fullName.length < 3 ? fullName : user.fullName,
          },
        });
      } else {
        // Yangi foydalanuvchi: akkaunt hali yaratilmagan —
        // profil register sahifasiga oldindan to'ldirish uchun qaytariladi
        return ok(
          res,
          {
            pendingRegister: true,
            profile: {
              fullName,
              email,
              avatarUrl: picture || null,
              phone: null,
            },
          },
          'Google orqali davom eting — ro\'yxatdan o\'tishni yakunlang'
        );
      }
    }

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return ok(
      res,
      {
        user: sanitizeUser(user),
        ...tokens,
        isNewUser: false,
        // Frontend profildagi ism/familiya/telefon maydonlarini to'ldirish uchun tayyor ma'lumot
        profile: {
          fullName,
          email,
          phone: user.phone || null,
        },
      },
      'Google orqali muvaffaqiyatli kirdingiz'
    );
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
    if (phone !== undefined && phone !== '' && phone !== null) {
      const phoneNorm = normalizePhone(String(phone));
      if (!phoneNorm) return badRequest(res, "Telefon +998 XX XXX XX XX formatda bo'lishi kerak");
      data.phone = phoneNorm;
    } else if (phone === null || phone === '') {
      data.phone = null;
    }
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

// ============ FORGOT PASSWORD (email orqali havola) ============
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return badRequest(res, "Email noto'g'ri formatda");
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user) {
      // Xavfsizlik: user topilmasa ham "yuborildi" deb javob beramiz
      return ok(res, null, 'Parolni tiklash havolasi emailingizga yuborildi');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 soat

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiresAt: expiresAt },
    });

    const base = config.frontendUrls[0] || 'http://localhost:3006';
    const resetUrl = `${base}/reset-password?token=${token}`;
    await sendEmail(user.email, 'Cyber-ZONE — Parolni tiklash', buildResetEmail(resetUrl));

    return ok(
      res,
      { devToken: token }, // dev/test uchun (haqiqiy SMTP bo'lmasa)
      'Parolni tiklash havolasi emailingizga yuborildi'
    );
  } catch (err) {
    next(err);
  }
};

// ============ RESET PASSWORD (token orqali) ============
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    if (!token) return badRequest(res, 'Token talab qilinadi');
    if (!newPassword || String(newPassword).length < 6) {
      return badRequest(res, "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
    }

    const user = await prisma.user.findUnique({ where: { resetToken: String(token) } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      return badRequest(res, 'Token yaroqsiz yoki muddati tugagan. Qayta so\'rov yuboring.');
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
    });

    return ok(res, null, 'Parol muvaffaqiyatli tiklandi. Endi kirishingiz mumkin.');
  } catch (err) {
    next(err);
  }
};

function sanitizeUser(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}