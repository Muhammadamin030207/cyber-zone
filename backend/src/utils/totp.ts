import crypto from 'crypto';

/**
 * TOTP (RFC 6238) — Google Authenticator / Authy mos keladigan ikki faktorli kod.
 * Tashqi bog'liqlik yo'q: base32 (RFC 4648) + HMAC-SHA1 faqat Node `crypto` bilan.
 * Standart: 6 raqam, 30 sekundlik qadam, ±1 qadam tolerance (soat siljishi uchun).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ============================================================================
// TOTP secret'ni DB'da ENKRIPSIYA (at-rest encryption)
// ============================================================================
// Spec §P2: twoFactorSecret bazaga OCHIQ (plaintext) yozilmaydi — AES-256-GCM
// bilan shifrlanib saqlanadi. Ushbu fayl barcha o'qish (verifyTotp) va yozish
// (encryptTotpSecret) nuqtalarini bitta chokepoint qilib birlashtiradi, shuning
// uchun auth/webauthn/twoFactor controller'larida hech narsa o'zgartirilmaydi.
//
// Mavjud (eski, ochiq) secretlar ham ishlaydi: agar qiymat `ck1:` prefiksiga
// ega bo'lmasa — legacy plaintext deb qabul qilinadi va SHU SECRET bilan
// verify qilinadi (foydalanuvchi kodini kiritishi shart emas). Keyingi
// `twoFactorSecret: encryptTotpSecret(...)` yozuvi uni avtomatik yangilaydi.
//
// Kalit manbasi: `TOTP_AT_REST_KEY` (32 bayt hex yoki base64). O'rnatilmagan
// bo'lsa — `JWT_SECRET`'dan deterministik HKDF-SHA256 orqali olinadi (xuddi
// shu ish jarayonida, DB'dagi eski yozuvlar ochib berilishi mumkinligi uchun
// kalit o'zgarishi PORCHda eski secret buzilishiga olib keladi — shuning uchun
// production'da alohida TOTP_AT_REST_KEY o'rnating).
const TOTP_ENC_PREFIX = 'ck1:';

function totpAtRestKey(): Buffer {
  const raw = process.env.TOTP_AT_REST_KEY || process.env.JWT_SECRET || 'cyber-zone-dev-totp-key';
  const info = Buffer.from('cyber-zone:totp-at-rest:v1', 'utf8');
  return crypto.createHmac('sha256', raw).update(info).digest(); // 32 bayt
}

/** Secret'ni at-rest shifrlab qaytaradi (DB'da mana shu saqlanadi). */
export function encryptTotpSecret(secretBase32: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', totpAtRestKey(), iv);
  const ct = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ct]).toString('base64');
  return `${TOTP_ENC_PREFIX}${payload}`;
}

/** Shifrlangan secret'ni ochadi. Legacy (ochiq) bo'lsa — o'zini qaytaradi. */
export function decryptTotpSecret(stored: string): string {
  if (!stored || !stored.startsWith(TOTP_ENC_PREFIX)) return stored; // legacy plaintext
  try {
    const buf = Buffer.from(stored.slice(TOTP_ENC_PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', totpAtRestKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    if (!plain) return stored;
    return plain;
  } catch {
    // Kalit o'zgargan yoki buzuq yozuv — ochiq deb hisoblanmaydi, asl qiymatni qaytaramiz.
    // (verify keyin muvaffaqiyatsiz bo'ladi; admin sekretni qayta o'rnatishi mumkin.)
    return stored;
  }
}

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
