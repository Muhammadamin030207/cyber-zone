import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  buildOtpAuthUrl,
  generateBackupCodes,
} from '../utils/totp';

// RFC 6238 (TOTP) / RFC 4226 (HOTP) rasmiy test vektori:
// secret (ASCII) = "12345678901234567890" -> base32 = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('base32 encode/decode round-trip', () => {
    const buf = Buffer.from('12345678901234567890', 'ascii');
    expect(base32Encode(buf)).toBe(RFC_SECRET_B32);
    expect(base32Decode(RFC_SECRET_B32).toString('ascii')).toBe('12345678901234567890');
  });

  it('RFC 6238 test vektori (SHA1, 8 raqam, T=59s)', () => {
    expect(generateTotp(RFC_SECRET_B32, 59_000, 30, 8)).toBe('94287082');
  });

  it('generateTotpSecret: 160-bit base32, tasodifiy', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]+$/);
    expect(a.length).toBe(32);
    expect(a).not.toBe(b);
  });

  it('verifyTotp: joriy kodni qabul qiladi, noto\'g\'ri kodni rad etadi', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = generateTotp(secret, now);
    expect(verifyTotp(secret, code, { timestampMs: now })).toBe(true);
    expect(verifyTotp(secret, '000000', { timestampMs: now })).toBe(false);
    expect(verifyTotp(secret, '12345', { timestampMs: now })).toBe(false);
  });

  it('verifyTotp: ±1 qadam (30s) tolerantligi', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const previous = generateTotp(secret, now - 30_000);
    expect(verifyTotp(secret, previous, { timestampMs: now })).toBe(true);
    // 3 qadam oldingi kod endi qabul qilinmaydi
    const stale = generateTotp(secret, now - 120_000);
    expect(verifyTotp(secret, stale, { timestampMs: now })).toBe(false);
  });

  it('buildOtpAuthUrl: to\'g\'ri otpauth URI', () => {
    const url = buildOtpAuthUrl('ABCDEFGH', 'user@example.com');
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('secret=ABCDEFGH');
    expect(url).toContain('issuer=Cyber-ZONE');
    expect(url).toContain('digits=6');
  });

  it('generateBackupCodes: 8 ta unikal formatli kod', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(c).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/));
  });
});
