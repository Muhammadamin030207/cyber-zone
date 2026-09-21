import crypto from 'crypto';

/**
 * TOTP (RFC 6238) — Google Authenticator / Authy mos keladigan ikki faktorli kod.
 * Tashqi bog'liqlik yo'q: base32 (RFC 4648) + HMAC-SHA1 faqat Node `crypto` bilan.
 * Standart: 6 raqam, 30 sekundlik qadam, ±1 qadam tolerance (soat siljishi uchun).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Xavfsiz tasodifiy base32 secret (default 20 bayt = 160 bit, RFC tavsiyasi). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Noto\'g\'ri base32 belgi');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Berilgan counter uchun HOTP qiymati (RFC 4226). */
function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 10 ** digits).padStart(digits, '0');
}

/** TOTP kodni hisoblash (default: 30s qadam, 6 raqam). */
export function generateTotp(secretBase32: string, timestampMs = Date.now(), stepSeconds = 30, digits = 6): string {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Kodni tekshirish. ±1 qadam (±30s) tolerance — foydalanuvchi soati biroz
 * farq qilishi mumkin. Vaqtga bog'liq bo'lmagan taqqoslash ishlatiladi.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  opts: { window?: number; stepSeconds?: number; digits?: number; timestampMs?: number } = {}
): boolean {
  const { window = 1, stepSeconds = 30, digits = 6, timestampMs = Date.now() } = opts;
  const normalized = String(token || '').replace(/\D/g, '');
  if (normalized.length !== digits) return false;

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  for (let i = -window; i <= window; i += 1) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, counter + i, digits)), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
}

/** Authenticator ilovasi uchun otpauth:// URI (QR kod shu asosida chiziladi). */
export function buildOtpAuthUrl(secretBase32: string, accountName: string, issuer = 'Cyber-ZONE'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Bir martalik tiklash kodlari (parol o'rniga ishlatiladi). */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}
