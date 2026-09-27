import type { Response } from 'express';
import prisma from '../lib/prisma';
import { generatePendingLoginToken } from '../lib/jwt';
import { resetData } from './loginThrottle';

/**
 * Ikki faktorli (2FA / passkey) siyosatini BIR joyda yig'adi.
 *
 * Oldingi holatda uchta kirish yo'li (parol, Google, passkey) o'z siyosatini
 * alohida qo'llardi va bu uch xil xato chiqardi:
 *   1) passkey 2FA ni butunlay o'tkazib yuborardi (F2),
 *   2) Google login 2FA/passkey ni umuman tekshirmasdi (F3),
 *   3) passkey muvaffaqiyatli bo'lgach to'g'ridan-to'gri token berilardi.
 *
 * Endi har bir kirish yo'li shu yagona yordamchini chaqiradi: faktorlar
 * ZANJIR bo'lib tekshiriladi (passkey -> 2FA) va hech qanday yo'l
 * tasdiqlanmagan faktorlarni o'tkazib yubora olmaydi.
 */
export interface FactorPolicyUser {
  id: string;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  requirePasskey: boolean;
}

export type PendingFactor = 'pending-passkey' | 'pending-2fa';

export interface FactorGate {
  /** 2-bosqich talab qilinadimi. null => kirish to'liq ruxsat beriladi. */
  pending: PendingFactor | null;
  /** 2-bosqich uchun oraliq token (faqat pending !== null bo'lganda). */
  token?: string;
  /** pending === 'pending-passkey' bo'lganda — keyingi bosqich 2FA ekanini bilish uchun. */
  requiresTwoFactorAfterPasskey?: boolean;
}

/** Passkey talabi qo'yilgan, lekin hech qanday passkey ro'yxatlanmagan. */
async function passkeyRequiredButNone(user: FactorPolicyUser): Promise<boolean> {
  if (!user.requirePasskey) return false;
  const count = await prisma.passkey.count({ where: { userId: user.id } });
  return count > 0;
}

/**
 * Berilgan faktordan keyin qolgan faktorlarni tekshiradi.
 *
 * @param passed faktorning allaqon tasdiqlangan foydalanuvchi (masalan parol
 *                yoki muvaffaqiyatli passkey ceremony'si).
 */
export async function evaluateRemainingFactors(passed: FactorPolicyUser): Promise<FactorGate> {
  // 1-bosqich: passkey. Talab qilingan va mavjud bo'lsa — avval shu.
  if (await passkeyRequiredButNone(passed)) {
    const alsoNeeds2fa = Boolean(passed.twoFactorEnabled && passed.twoFactorSecret);
    return {
      pending: 'pending-passkey',
      token: generatePendingLoginToken(passed.id, 'pending-passkey'),
      requiresTwoFactorAfterPasskey: alsoNeeds2fa,
    };
  }

  // 2-bosqich: TOTP.
  if (passed.twoFactorEnabled && passed.twoFactorSecret) {
    return {
      pending: 'pending-2fa',
      token: generatePendingLoginToken(passed.id, 'pending-2fa'),
    };
  }

  return { pending: null };
}

/** Muvaffaqiyatli parol/Google holatidagi brute-force hisoblagichlarini tozalaydi. */
export async function clearThrottleIfNeeded(user: {
  id: string;
  failedLoginAttempts: number;
  loginLockStage: number;
  loginLockedUntil: Date | null;
}): Promise<void> {
  if (user.failedLoginAttempts || user.loginLockStage || user.loginLockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: resetData() });
  }
}

/**
 * 2-bosqich javobini qaytaradi (202) — oraliq token bilan.
 * Chaqiruvchi allaqachon `evaluateRemainingFactors` ishga tushirgan bo'lishi kerak.
 */
export function sendPendingChallenge(res: Response, gate: FactorGate, userId: string): void {
  res.status(202).json({
    success: false,
    code: gate.pending === 'pending-2fa' ? 'TWO_FACTOR_REQUIRED' : 'PASSKEY_REQUIRED',
    message:
      gate.pending === 'pending-2fa'
        ? 'Ikki faktorli himoya yoqilgan. Autentifikator kodini kiriting.'
        : 'Xavfsizlik uchun passkey bilan tasdiqlash talab qilinadi.',
    data: {
      pendingLoginToken: gate.token,
      userId,
      // Passkey'dan keyin ham 2FA kerak bo'lsa frontend shuni bilishi kerak.
      ...(gate.pending === 'pending-2fa' ? { requiresTwoFactor: true } : { requirePasskeyVerified: false }),
      ...(gate.requiresTwoFactorAfterPasskey ? { requireTwoFactorAfterPasskey: true } : {}),
    },
  });
}
