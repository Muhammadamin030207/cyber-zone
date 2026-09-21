import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { Secret } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { generateTokens, verifyRefreshToken } from '../lib/jwt';
import { config } from '../config';
import { AuthRequest } from '../types';
import { ok, badRequest, unauthorized, notFoundMsg, serverError, forbidden } from '../utils/response';
import { sendEmail, buildResetEmail, buildResetText, buildTempPasswordEmail, buildTempPasswordText } from '../lib/mailer';
import { sendSecurityAlert, clientIp, describeUserAgent, recordSecurityEvent } from '../lib/securityAlerts';
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

/**
 * Muvaffaqiyatli login faktini saqlaydi va yangi qurilma aniqlansa xavfsizlik
 * ogohlantirishini yuboradi (parol to'g'ri bo'lsa ham hisob egasini xabardor qilish).
 */
export async function recordSuccessfulLogin(
  user: { id: string; email: string; fullName: string; lastLoginAt?: Date | null; lastLoginIp?: string | null; lastLoginUserAgent?: string | null },
  req: Request
): Promise<void> {
  const ip = clientIp(req);
  const ua = (req.headers['user-agent'] as string | undefined) || null;
  const isNewDevice = Boolean(user.lastLoginAt) && (user.lastLoginIp !== ip || user.lastLoginUserAgent !== ua);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      lastLoginUserAgent: ua,
    },
  });

  if (isNewDevice) {
    void sendSecurityAlert(user.email, user.fullName, 'NEW_DEVICE_LOGIN', {
      ip,
      device: describeUserAgent(ua),
      when: new Date(),
    });
  }
}

// ============ LOGOUT (server-side sessiyani bekor qilish) ============
// Stateless JWT bo'lsa ham tokenVersion oshiriladi — shu foydalanuvchining
// barcha mavjud tokenlari darhol yaroqsiz bo'ladi (boshqa qurilmalar ham).
export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    void recordSecurityEvent(req.user!.userId, 'LOGOUT', {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return ok(res, null, 'Tizimdan muvaffaqiyatli chiqdingiz');
  } catch (err) {
    next(err);
  }
};

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
      tokenVersion: user.tokenVersion,
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

    // ============ VAQTINCHALIK PAROL (forgot-password) ============
    // User'ning temp paroli haqiqiy login paroli sifatida ishlaydi; kiritilgach
    // mustChangePassword=TRUE (yangi parol majburiy). Bir giymetli va expiring.
    let usedTempPassword = false;
    if (user.tempPasswordHash && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt > new Date()) {
      const tempOk = await bcrypt.compare(password, user.tempPasswordHash);
      if (tempOk) usedTempPassword = true;
    }

    // Oddiy BJ parol tekshiruvi (user parolga ega bo'lsa). Google-only account parolga
    // ega emas — unda faqat temp parol yo'li ishlaydi.
    const valid = usedTempPassword ? true : user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!valid) {
      const outcome = computeAfterFailure(user);
      await prisma.user.update({ where: { id: user.id }, data: outcome.data });
      void recordSecurityEvent(user.id, outcome.locked ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', {
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
        metadata: { stage: outcome.data.loginLockStage, failedAttempts: outcome.data.failedLoginAttempts },
      });
      if (outcome.locked) {
        void sendSecurityAlert(user.email, user.fullName, 'ACCOUNT_LOCKED', {
          ip: clientIp(req),
          device: describeUserAgent(req.headers['user-agent'] as string | undefined),
          when: new Date(),
        });
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

    // ============ PASSKEY SECOND FACTOR (server enforcement) ============
    // Shaxsiy passkey talab qiladigan hisoblar: parol to'g'ri bo'lsa ham,
    // passkey verificationdan o'tmasdan TOKEN BERILMAYDI. Server qaror qiladi.
    if (user.requirePasskey) {
      const hasPasskeys = await prisma.passkey.count({ where: { userId: user.id } });
      if (hasPasskeys > 0) {
        // Muvaffaqiyatli parol — hisoblagichlarni tozalash
        if (user.failedLoginAttempts || user.loginLockStage || user.loginLockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: resetData() });
        }
        // Faqat 5 daqiqa amal qiladigan "pending" token — keyingi passkey bosqichi uchun
        const pendingLoginToken = jwt.sign(
          { type: 'pending-passkey', userId: user.id },
          config.jwt.secret as Secret,
          { expiresIn: '5m' }
        );
        return res.status(202).json({
          success: false,
          code: 'PASSKEY_REQUIRED',
          message: 'Xavfsizlik uchun passkey bilan tasdiqlash talab qilinadi.',
          data: { requirePasskeyVerified: false, pendingLoginToken, userId: user.id },
        });
      }
      // passkey bo'lmasa — parol yetarli (user keyin qo'shishi mumkin)
    }

    // ============ IKKI FAKTORLI AUTENTIFIKATSIYA (TOTP) ============
    // Parol to'g'ri, ammo hisobda 2FA yoqilgan — token berilmaydi, faqat 5 daqiqalik
    // "pending" token qaytariladi. Kod /two-factor/verify da tasdiqlanadi.
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (user.failedLoginAttempts || user.loginLockStage || user.loginLockedUntil) {
        await prisma.user.update({ where: { id: user.id }, data: resetData() });
      }
      const pendingLoginToken = jwt.sign(
        { type: 'pending-2fa', userId: user.id },
        config.jwt.secret as Secret,
        { expiresIn: '5m' }
      );
      return res.status(202).json({
        success: false,
        code: 'TWO_FACTOR_REQUIRED',
        message: 'Ikki faktorli himoya yoqilgan. Autentifikator kodini kiriting.',
        data: { requiresTwoFactor: true, pendingLoginToken, userId: user.id },
      });
    }

    // ============ MUVAFIQQIYATLI LOGIN ============
    // Muvaffaqiyatli login — brute-force hisoblagichlarini tozalash
    if (user.failedLoginAttempts || user.loginLockStage || user.loginLockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: resetData() });
    }

    await recordSuccessfulLogin(user, req);

    void recordSecurityEvent(user.id, 'LOGIN_SUCCESS', {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    // Vaqtinchalik parol bilan kirilganda — mustChangePassword=true va
    // faqat shartli token (yangi parol o'rnatilgunga qadar asosiy session yo'q).
    if (user.mustChangePassword) {
      return res.status(200).json({
        success: false,
        code: 'MUST_CHANGE_PASSWORD',
        message: 'Vaqtinchalik parol bilan kirdingiz. Yangi parol o\'rnatishingiz shart.',
        data: { user: sanitizeUser(user), ...tokens, mustChangePassword: true },
      });
    }

    return ok(res, { user: sanitizeUser(user), ...tokens }, 'Xush kelibsiz!');
  } catch (err) {
    next(err);
  }
};

// ============ BLOKDAN CHIQARISH (Alt+B) ============
// Bloklangan hisobni olib tashlash. Xavfsizlik: blok faqat hisob EGASI uchun —
// to'g'ri joriy parol bcrypt orqali tasdiqlanmasa, hech qanday o'zgartirish
// bo'lmaydi (brute-force qiluvchi bundan foyda ko'rmaydi). Urinishlar IP
// bo'yicha rate-limit qilinadi va barcha holatlar xavfsizlik voqealari sifatida
// log qilinadi.
const unlockAttemptsCache = new Map<string, { count: number; windowStart: number }>();

function unlockRateLimited(ip: string): boolean {
  const windowMs = 10 * 60 * 1000;
  const max = 5;
  const now = Date.now();
  const cur = unlockAttemptsCache.get(ip);
  if (!cur || now - cur.windowStart > windowMs) {
    unlockAttemptsCache.set(ip, { count: 1, windowStart: now });
    return false;
  }
  cur.count += 1;
  return cur.count > max;
}

export const unlockAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) return badRequest(res, 'Email va parol talab qilinadi');

    const ip = clientIp(req) ?? 'unknown';
    if (unlockRateLimited(ip)) {
      return res.status(429).json({ success: false, message: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Umumiy javob — hisob mavjudligi ochilmaydi (enumeration oldini olish)
    if (!user) return badRequest(res, 'Email yoki parol noto\'g\'ri');
    if (user.status !== 'ACTIVE') return forbidden(res, 'Akkauntingiz bloklangan');

    const passOk = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!passOk) {
      void recordSecurityEvent(user.id, 'LOGIN_UNLOCK_FAILED', {
        ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        metadata: { stage: user.loginLockStage, failedAttempts: user.failedLoginAttempts },
      });
      return badRequest(res, 'Parol noto\'g\'ri');
    }

    // To'g'ri parol — hisobning barcha blok holati tozalanadi
    await prisma.user.update({ where: { id: user.id }, data: resetData() });
    void recordSecurityEvent(user.id, 'LOCK_RELEASED', {
      ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      metadata: { source: 'unlock-shortcut' },
    });
    void sendSecurityAlert(user.email, user.fullName, 'LOCK_RELEASED', {
      ip,
      device: describeUserAgent(req.headers['user-agent'] as string | undefined),
      when: new Date(),
    });

    return ok(res, { unlocked: true }, 'Blok olib tashlandi. Endi kiring');
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
      tokenVersion: user.tokenVersion,
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

    // Server-side sessiya bekor qilingan bo'lsa (logout/parol o'zgarishi), refresh
    // token ham ishlamaydi — aks holda bekor qilishni chetlab o'tish mumkin bo'lardi.
    if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      return unauthorized(res, 'Sessiya tugagan. Iltimos, qaytadan kiring.');
    }

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
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

    if (!oldPassword || typeof oldPassword !== 'string') {
      return badRequest(res, 'Eski parol talab qilinadi');
    }

    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) return badRequest(res, 'Eski parol noto\'g\'ri');

    if (!newPassword || String(newPassword).length < 6) {
      return badRequest(res, "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    void recordSecurityEvent(user.id, 'PASSWORD_CHANGED', {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    void sendSecurityAlert(user.email, user.fullName, 'PASSWORD_CHANGED', {
      ip: clientIp(req),
      device: describeUserAgent(req.headers['user-agent'] as string | undefined),
      when: new Date(),
    });

    return ok(res, null, 'Parol muvaffaqiyatli o\'zgartirildi. Barcha qurilmalardan chiqdingiz — qaytadan kiring.');
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

// ============ FORGOT PASSWORD (vaqtinchalik parol email orqali) ============
// P3: Server xavfsiz tasodifiy VAQTINCHALIK parol yaratadi -> hash qiladi ->
// expiring saqlaydi -> emailga yuboradi. User shu parol bilan kiradi -> majburiy
// yangi parol o'rnatadi (mustChangePassword).
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
    if (user.status !== 'ACTIVE') {
      return ok(res, null, 'Parolni tiklash havolasi emailingizga yuborildi');
    }

    // Xavfsiz tasodifiy VAQTINCHALIK parol (12-16 belgi, alfanumerik + belgilar)
    const tempPassword = crypto.randomBytes(10).toString('base64url'); // ~14 belgi
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);
    const expiresAt = new Date(Date.now() + config.webauthn.tempPasswordMinutes * 60 * 1000);

    // Hash saqlanadi — plain text DB'da YO'Q. Blok zanjiridan mustaqil.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tempPasswordHash,
        tempPasswordExpiresAt: expiresAt,
        mustChangePassword: true,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });

    try {
      await sendEmail(user.email, 'Cyber-ZONE — Vaqtinchalik parol', buildTempPasswordEmail(user.fullName, tempPassword, expiresAt), buildTempPasswordText(user.fullName, tempPassword, expiresAt));
      void recordSecurityEvent(user.id, 'PASSWORD_RESET_REQUESTED', {
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined,
      });
    } catch (sendErr) {
      console.error(`[forgot-password] Email yuborilmadi -> user=${user.id} email=${user.email}`);
      console.error(`[forgot-password] Sabab: ${(sendErr as Error).stack || (sendErr as Error).message}`);
      // Token bekor qilinadi (qayta urinish mumkin)
      await prisma.user
        .update({ where: { id: user.id }, data: { tempPasswordHash: null, tempPasswordExpiresAt: null } })
        .catch(() => undefined);
      if (process.env.NODE_ENV === 'production') {
        return serverError(res, 'Vaqtinchalik parolni yuborishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
      }
    }

    return ok(
      res,
      process.env.NODE_ENV === 'production'
        ? null
        : { devTempPassword: tempPassword }, // faqat dev/test uchun (haqiqiy SMTP bo'lmasa)
      'Vaqtinchalik parol emailingizga yuborildi'
    );
  } catch (err) {
    next(err);
  }
};

// ============ RESET PASSWORD (eskirgan token orqali, kompat/backup) ============
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
    // Parol yangilangach barcha hisoblagichlar va vaqtinchalik parol tozalanadi.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
        tempPasswordHash: null,
        tempPasswordExpiresAt: null,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
        ...resetData(),
      },
    });

    void recordSecurityEvent(user.id, 'PASSWORD_RESET', {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    void sendSecurityAlert(user.email, user.fullName, 'PASSWORD_RESET', {
      ip: clientIp(req),
      device: describeUserAgent(req.headers['user-agent'] as string | undefined),
      when: new Date(),
    });

    return ok(res, null, 'Parol muvaffaqiyatli tiklandi. Endi kirishingiz mumkin.');
  } catch (err) {
    next(err);
  }
};

// ============ MUST CHANGE PASSWORD (vaqtinchalik parol bilan kirilgach) ============
// POST /api/auth/security/change-password — autentifikatsiyalangan va mustChangePassword=true bo'lgan
// user yangi parol o'rnatadi. Temp parol berilgan holatda login qilgan bo'lishi kerak.
export const setNewPassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { newPassword, currentPassword } = req.body;
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return notFoundMsg(res, 'Foydalanuvchi topilmadi');

    if (!newPassword || String(newPassword).length < 6) {
      return badRequest(res, "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
    }

    // mustChangePassword rejimi: temp parol emas, balki hozirgi (eski) parol bilan ham tasdiqlash
    if (!user.mustChangePassword) {
      if (!currentPassword) return badRequest(res, 'Joriy parol talab qilinadi');
      const okCurrent = user.passwordHash ? await bcrypt.compare(String(currentPassword), user.passwordHash) : false;
      if (!okCurrent) return badRequest(res, 'Joriy parol noto\'g\'ri');
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        tempPasswordHash: null,
        tempPasswordExpiresAt: null,
        tokenVersion: { increment: 1 },
      },
    });

    void recordSecurityEvent(user.id, 'PASSWORD_CHANGED', {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    void sendSecurityAlert(user.email, user.fullName, 'PASSWORD_CHANGED', {
      ip: clientIp(req),
      device: describeUserAgent(req.headers['user-agent'] as string | undefined),
      when: new Date(),
    });

    return ok(res, null, 'Parol muvaffaqiyatli yangilandi. Qaytadan kiring.');
  } catch (err) {
    next(err);
  }
};

// ============ SECURITY EVENTS (audit histori — Security Center) ============
// GET /api/auth/security/events (auth) — oxirgi xavfsizlik voqealari.
export const securityEvents = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const events = await prisma.securityEvent.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, type: true, ip: true, userAgent: true, metadata: true, createdAt: true },
    });
    return ok(res, events);
  } catch (err) {
    next(err);
  }
};

export function sanitizeUser(user: any) {
  const {
    passwordHash,
    resetToken,
    resetTokenExpiresAt,
    tempPasswordHash,
    tempPasswordExpiresAt,
    failedLoginAttempts,
    loginLockStage,
    loginLockedUntil,
    twoFactorSecret,
    twoFactorBackupCodes,
    ...rest
  } = user;
  return rest;
}