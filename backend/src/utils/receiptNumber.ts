import prisma from '../lib/prisma';

/**
 * CHEK (RECEIPT) RAQAMI — inson o'qiydigan qisqa to'lov identifikatori.
 *
 * Nima uchun kerak:
 * Mijoz bank ilovasida to'laydi, keyin chek (screenshot) yuboradi. Admin
 * bank hisobida shu to'lovni izlaydi. Agar biz UUID yuborsak, mijoz
 * telefon orqali 32 ta belgini o'qiy olmaydi.
 *
 * Format (mijoz talabi bo'yicha): `CZ-20260928-000123`
 *
 *   - `CZ-`         — prefiks (Cyber-Zone).
 *   - `YYYYMMDD`    — to'lov kuni (Toshkent vaqti bo'yicha).
 *   - `NNNNNN`      — kunlik tartib raqami (000001 dan), 6 ta raqam.
 *
 * Nima uchun tartibli: admin va mijoz bir-biriga raqamni aytayotganda
 * kunduzgi tartib raqamni topish oson. Unique index takrorlanishni DB
 * darajasida rad etadi, parallel yaratishda P2002 konflikti qayta sanash
 * bilan hal qilinadi.
 */

/** Toshkent vaqtida `YYYYMMDD` (Kun belgilashda UTC emas, mahalliy vaqt muhim). */
export function tashkentLocalDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

/** `CZ-20260928-` — kunlik prefiks (izlash/boshlash uchun). */
export function receiptPrefixFor(now: Date = new Date()): string {
  return `CZ-${tashkentLocalDateKey(now)}-`;
}

/** `CZ-20260928-000123` — kunlik tartib raqamidan raqam qurish. */
export function buildReceiptNumber(seq: number, now: Date = new Date()): string {
  return `${receiptPrefixFor(now)}${String(seq).padStart(6, '0')}`;
}

/** Harbir urinishdagi bandlikni tekshirish uchun. */
const MAX_ATTEMPTS = 8;

/**
 * Band bo'lmagan chek raqamini (kunlik navbatdagi tartib raqamni) qaytaradi.
 *
 * Kunning oxirgi chek raqamidan keyingisini izlaydi. Ikkita parallel to'lov
 * bir xil raqamni «olib qolsa», ikkinchisi unique (P2002) xatosiga
 * ulanmaydi — `findUnique` tekshiruvi tufayli keyingi bo'sh raqamga o'tadi.
 */
export async function reserveReceiptNumber(now: Date = new Date()): Promise<string> {
  const prefix = receiptPrefixFor(now);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const count = await prisma.payment.count({ where: { receiptNumber: { startsWith: prefix } } });
    const candidate = buildReceiptNumber(count + 1, now);
    const taken = await prisma.payment.findUnique({
      where: { receiptNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // Parallel to'lovlar juda ko'p (8 tasi bir vaqtda) bo'lsa — xato.
  // Chek raqamisiz to'lov yaratishdan yaxshiroq.
  throw new Error('RECEIPT_NUMBER_EXHAUSTED');
}