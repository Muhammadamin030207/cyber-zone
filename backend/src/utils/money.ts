/**
 * Pul (so'm, 2 kasrli) bilan ishlash bo'yicha xavfsiz yordamchilar.
 * Barcha arifmetika butun tiyinga yaxlitlanadi — float xatolardan himoya.
 */

/** Prisma Decimal / string / number -> number */
export function toNumber(v: any): number {
  if (typeof v === 'object' && v !== null && typeof v.toString === 'function') return Number(v.toString());
  return Number(v);
}

/** 2 kasrga aniq yaxlitlash (tiyin) */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** To'lov miqdori validatsiyasi: musbat, max 2 kasr */
export function isValidAmount(n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}