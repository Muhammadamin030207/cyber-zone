import { config } from './index';

const TOTP_MIN_LENGTH = 32;
const JWT_MIN_LENGTH = 32;

/** Bo'sh yoki juda qisqa kalitlarni aniqlaydi (qiymatni hech qayerda chiqarmaydi). */
function lengthOf(value: string | undefined | null): number {
  return String(value || '').trim().length;
}

export function totpKeyHealthy(): boolean {
  return lengthOf(process.env.TOTP_AT_REST_KEY) >= TOTP_MIN_LENGTH;
}

/**
 * SMTP sozlanganmi. forgot-password/parol tiklash emailga bog'liq — sozlanmagan
 * bo'lsa foydalanuvchi hech qanday yo'l bilan parolini tiklay olmaydi.
 */
export function isEmailConfigured(): boolean {
  return Boolean(config.email.host && config.email.user && config.email.pass && config.email.from);
}

export function isJwtSecretHealthy(): boolean {
  return lengthOf(config.jwt.secret) >= JWT_MIN_LENGTH && lengthOf(config.jwt.refreshSecret) >= JWT_MIN_LENGTH;
}

/** Sanity-check: kalitlar yetarli bo'lsa, TOTP shifrlash ishlaydi. */
export function assertTotpAtRestKey(): void {
  if (!totpKeyHealthy()) {
    throw new Error(
      'TOTP_AT_REST_KEY sozlanmagan yoki 32+ belgidan kam. 2FA secretlarini AES-256-GCM bilan ' +
        'shifrlash uchun kamida 32 ta tasodifiy belgi kerak. Zaif fallback kalit ISHLATILMAYDI.',
    );
  }
}

/**
 * Diagnostika uchun xulosa — hech qanday QIMMAT chiqarmaydi, faqat holat.
 * Bu `/api/ready` da ko'rinadi va loglarda jimgina ogohlantirish beradi.
 */
export function securityConfigStatus(): {
  totpEncryption: 'ok' | 'misconfigured';
  jwt: 'ok' | 'weak';
  email: 'ok' | 'not_configured';
} {
  return {
    totpEncryption: totpKeyHealthy() ? 'ok' : 'misconfigured',
    jwt: isJwtSecretHealthy() ? 'ok' : 'weak',
    email: isEmailConfigured() ? 'ok' : 'not_configured',
  };
}
