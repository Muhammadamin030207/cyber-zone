import crypto from 'crypto';

export function md5hex(data: string): string {
  return crypto.createHash('md5').update(data, 'utf8').digest('hex');
}

export function sha256hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export function hmacSha256hex(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/** Timing-safe taqqoslash (signature validatsiyasi uchun) */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}