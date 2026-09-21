import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { generateTokens, verifyRefreshToken } from '../lib/jwt';
import { config } from '../config';
import { AuthRequest } from '../types';
import { ok, badRequest, unauthorized, notFoundMsg, serverError } from '../utils/response';
import { sendEmail, buildResetEmail, buildResetText } from '../lib/mailer';
import { getLockState, computeAfterFailure, resetData } from '../utils/loginThrottle';

const googleClient = new OAuth2Client(config.google.clientId);

/** Telefon raqamni yagona formaga keltiradi: "+998 90 123 45 67" yoki "998901234567" -> "+998901234567" */
function normalizePhone(p: string): string | null {
  const digits = String(p).replace(/\D/g, '');
  if (/^998\d{9}$/.test(digits)) return '+998' + digits.slice(3);
  if (/^\d{9}$/.test(digits)) return '+998' + digits;
  return null;
}

/** Emailni yagona formaga keltiradi: trim + kichik harf (email case-insensitive) */
function normalizeEmail(e: string): string {
  return String(e).trim().toLowerCase();
}

// ============ REGISTER (USER) ============
// googleToken berilganda parvoz qilib, parol ixtiyoriy (avtomatik random parol qo'yiladi)
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password, phone, language, googleToken } = req.body;
    let fullName = String(req.body.fullName || '').trim();
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return badRequest(res, 'email majburiy');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);

    const user = await prisma.user.findUnique({ where: { email } });

    // Brute-force: hisob vaqtincha bloklanganmi — parolni tekshirishdan OLDIN
    // (server avtoritet; frontend faqat shu javobga tayanadi).
    const lockState = getLockState(user);
    if (user && lockState.locked) {
      return res.status(429).json({
        success: false,
        message: 'Juda ko\'p noto\'g\'ri urinish. Hisob vaqtincha bloklandi.',
        code: 'ACCOUNT_LOCKED',
        lockedUntil: lockState.lockedUntil!.toISOString(),
        retryAfterSeconds: lockState.retryAfterSeconds,
        serverNow: new Date().toISOString(),
      });
    }

    if (!user) return badRequest(res, 'Email yoki parol noto\'g\'ri');

    if (!user.passwordHash) return badRequest(res, 'Ushbu akkaunt Google orqali yaratilgan');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const outcome = computeAfterFailure(user);
      await prisma.user.update({ where: { id: user.id }, data: outcome.data });
      if (outcome.locked) {
        return res.status(429).json({
          success: false,
          message: 'Juda ko\'p noto\'g\'ri urinish. Hisob vaqtincha bloklandi.',
          code: 'ACCOUNT_LOCKED',
          lockedUntil: outcome.lockedUntil!.toISOString(),
          retryAfterSeconds: outcome.retryAfterSeconds,
          serverNow: new Date().toISOString(),
        });
      }
      // Qolgan urinishlar soni — foydalanuvchiga nozik hint (enumeration xavfini
      // hisobga olib faqat mavjud hisob uchun qaytariladi).
      return res.status(400).json({
        success: false,
        message: 'Email yoki parol noto\'g\'ri',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: outcome.remainingAttempts,
      });
    }

    if (user.status !== 'ACTIVE') return unauthorized(res, 'Akkauntingiz bloklangan');

    // Muvaffaqiyatli login — brute-force hisoblagichlarini tozalash
    if (user.failedLoginAttempts || user.loginLockStage || user.loginLockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: resetData() });
    }

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
      email: rawEmail,
      sub: googleId,
      name,
      given_name,
      family_name,
      email_verified,
      picture,
    } = payload;
    const email = normalizeEmail(rawEmail || '');

    // Ism (given) va familiya (family) alohida olinadi — "Ism Familiya" formatida saqlanadi
    const fullName = [given_name, family_name].filter(Boolean).join(' ').trim() || name || email.split('@')[0] || 'Foydalanuvchi';

    if (!email_verified) return badRequest(res, 'Email tasdiqlanmagan');

    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      // googleId bo'yicha topilmasa, email bo'yicha qidiramiz
      user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        // Xavfsizlik: akkaunt parol bilan yaratilgan bo'lsa (passwordHash bor),
        // Google id'sini avtomatik bog'lab bo'lmaydi — aks holda Google orqali
        // akkauntni egallash (account pre-hijacking) mumkin bo'ladi.
        if (user.passwordHash && !user.googleId) {
          return unauthorized(res, 'Bu email allaqachon parol bilan ro\'yxatdan o\'tgan. Iltimos, parol orqali kiring yoki parolni tiklang.');
        }
        // Parolsiz/Google akkauntiga googleId biriktiramiz (xavfsiz holat)
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

    // Bloklangan yoki faol bo'lmagan foydalanuvchi Google orqali ham kira olmaydi
    if (user.status !== 'ACTIVE') return unauthorized(res, 'Akkauntingiz bloklangan');

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

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return unauthorized(res, 'Refresh token yaroqsiz yoki muddati o\'tgan');
    }

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
// Xavfsizlik: faqat ruxsat etilgan maydonlar yangilanadi.
// Email/role/status/id/password kabi maydonlar hech qachon o'zgartirilmaydi (immutable email).
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fullName, phone, language, avatarUrl } = req.body;

    // Email va boshqa himoyalangan maydonlar — yangilanishga yo'l qo'yilmaydi
    if (req.body.email !== undefined) {
      return badRequest(res, "Email manzilini o'zgartirib bo'lmaydi");
    }
    for (const field of ['role', 'status', 'id', 'userId', 'password', 'passwordHash', 'googleId', 'createdAt']) {
      if (req.body[field] !== undefined) {
        return badRequest(res, `Ruxsat etilmagan maydon: ${field}`);
      }
    }

    const data: any = {};
    if (fullName !== undefined) {
      const name = String(fullName).trim();
      if (name.length < 3) {
        return badRequest(res, "Ism kamida 3 ta belgidan iborat bo'lishi kerak");
      }
      data.fullName = name.slice(0, 120);
    }
    if (phone !== undefined && phone !== '' && phone !== null) {
      const phoneNorm = normalizePhone(String(phone));
      if (!phoneNorm) return badRequest(res, "Telefon +998 XX XXX XX XX formatda bo'lishi kerak");
      data.phone = phoneNorm;
    } else if (phone === null || phone === '') {
      data.phone = null;
    }
    if (language !== undefined) {
      const lang = String(language);
      if (!['uz', 'ru', 'en'].includes(lang)) {
        return badRequest(res, "Til uz/ru/en bo'lishi kerak");
      }
      data.language = lang;
    }
    if (avatarUrl !== undefined) {
      const url = String(avatarUrl);
      if (!/^https?:\/\//.test(url)) {
        return badRequest(res, 'Avatar rasm URL manzili noto\'g\'ri formatda');
      }
      data.avatarUrl = url.slice(0, 500);
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
    });

    return ok(res, sanitizeUser(user), 'Profil yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ UPLOAD AVATAR (multipart) ============
export const uploadAvatarImage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return badRequest(res, 'Rasm fayl yuklang');

    const origin = `${req.protocol}://${req.get('host')}`;
    const avatarUrl = `${origin}/uploads/avatars/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatarUrl },
    });

    return ok(res, sanitizeUser(user), 'Avatar yangilandi');
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

    if (!newPassword || String(newPassword).length < 6) {
      return badRequest(res, "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
    }

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

/** Reset token hash — DB'da faqat SHA-256 hash saqlanadi (Django uslubidagi xavfsiz yondashuv). */
function resetTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Reset link uchun frontend bazaviy domeni: so'rov manbai ruxsatlangan bo'lsa o'sha,
 *  aks holda birinchi sozlangan FRONTEND_URLS. localhost production xatga tushmaydi. */
function resetBaseUrl(req: Request): string {
  const probe = (req.headers.origin || req.get('referer') || '').trim();
  if (probe) {
    try {
      const origin = new URL(probe).origin;
      if (config.frontendUrls.includes(origin)) return origin;
    } catch {
      /* ignore */
    }
  }
  return config.frontendUrls[0] || `http://localhost:${config.port}`;
}

// ============ FORGOT PASSWORD (email orqali havola) ============
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest(res, "Email noto'g'ri formatda");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Xavfsizlik: user topilmasa ham "yuborildi" deb javob beramiz (enumeration oldini olish)
      return ok(res, null, 'Parolni tiklash havolasi emailingizga yuborildi');
    }

    // Har bir so'rov yangi token yaratadi (rate-limit spam oldini oladi). Bu, email
    // eski tokenning amal qilishini kutmasdan qayta yuborish imkonini beradi.
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = resetTokenHash(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 soat

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: tokenHash, resetTokenExpiresAt: expiresAt },
    });

    const base = resetBaseUrl(req);
    const resetUrl = `${base}/reset-password?token=${token}`;
    const expiryLabel = expiresAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

    try {
      await sendEmail(user.email, 'Cyber-ZONE — Parolni tiklash', buildResetEmail(resetUrl), buildResetText(resetUrl, expiryLabel ?? '1 soat'));
    } catch (sendErr) {
      // Soxta "yuborildi" javobi qaytarmaymiz: SMTP xatosi yuz berdi.
      // Sabab log'da aniq qoladi va token bekor qilinadi (qayta urinish mumkin).
      console.error(`[forgot-password] Email yuborilmadi -> user=${user.id} email=${user.email} resetUrl=${resetUrl}`);
      console.error(`[forgot-password] Sabab: ${(sendErr as Error).stack || (sendErr as Error).message}`);
      await prisma.user
        .update({ where: { id: user.id }, data: { resetToken: null, resetTokenExpiresAt: null } })
        .catch(() => undefined);

      if (process.env.NODE_ENV === 'production') {
        return serverError(res, 'Parolni tiklash havolasini yuborishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
      }
      // Dev: SMTP sozlanmagan bo'lsa ham token ishlatilishi uchun davom etamiz (devToken yetarli).
    }

    return ok(
      res,
      process.env.NODE_ENV === 'production'
        ? null
        : { devToken: token }, // faqat dev/test uchun (haqiqiy SMTP bo'lmasa)
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

    const tokenHash = resetTokenHash(String(token));
    const user = await prisma.user.findUnique({ where: { resetToken: tokenHash } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      return badRequest(res, 'Token yaroqsiz yoki muddati tugagan. Qayta so\'rov yuboring.');
    }
    if (user.status !== 'ACTIVE') return unauthorized(res, 'Akkauntingiz bloklangan');

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    // Parol tiklangach login bloklanishi ham tozalanadi — foydalanuvchi
    // havola orqali parol o'rnatgach darhol kira oladi (§4.2).
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiresAt: null, ...resetData() },
    });

    return ok(res, null, 'Parol muvaffaqiyatli tiklandi. Endi kirishingiz mumkin.');
  } catch (err) {
    next(err);
  }
};

function sanitizeUser(user: any) {
  const {
    passwordHash,
    resetToken,
    resetTokenExpiresAt,
    failedLoginAttempts,
    loginLockStage,
    loginLockedUntil,
    ...rest
  } = user;
  return rest;
}