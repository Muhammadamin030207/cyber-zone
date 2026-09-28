import prisma from '../lib/prisma';
import { randomInt } from 'node:crypto';

/**
 * CHEK (RECEIPT) RAQAMI — inson o'qiydigan qisqa to'lov identifikatori.
 *
 * Nima uchun kerak:
 * Mijoz bank ilovasida to'laydi, keyin chek (screenshot) yuboradi. Admin
 * bank hisobida shu to'lovni izlaydi. Agar biz UUID yuborsak, mijoz
 * telefon orqali 32 ta belgini o'qiy olmaydi. Shuning uchun har bir
 * to'lovga `CZ-XXXXXXXX` shaklida qisqa raqam beriladi:
 *
 *   - `CZ-`     — prefiks (Cyber-Zone). Natija hech qanday boshqa
 *                 identifikatorda (UUID) aralashmaydi.
 *   - `XXXXXXXX` — Crockford Base32 (0-9, A-Z, `I L O U` chiqarib
 *                 tashlangan) — telefon orqali aytganda chalkashmaydi
 *                 (`1`/`I`, `0`/`O` chalkashuvi yo'q).
 *
 * Nima uchun tasodifiy, balki tartibli emas: qisqa raqam sequential
 * bo'lsa, mijoz boshqaning to'lovini «sinab» ko'rish uchun raqamlarni
 * ketma-ket urib ko'rishi mumkin. Tasodifiy raqam buni sekinlashtiradi
 * (32^8 ≈ 1.1 × 10^12 variant), unique index esa takrorlanishni DB
 * darajasida rad etadi.
 */

/** Crockford Base32 — chalkashuv chiqarilgan belgilar (I, L, O, U) yo'q. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const PREFIX = 'CZ-';
const LENGTH = 8;
/** Bir urinishda tekshiriladigan variant soni (unique conflict qaytarisiga). */
const MAX_ATTEMPTS = 5;

/** `CZ-7K2M9QX4` shaklidagi tasodifiy raqam (DB'da band emas — faqat taklif). */
export function generateReceiptNumber(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${PREFIX}${out}`;
}

/**
 * Band bo'lmagan chek raqamini topib qaytaradi.
 *
 * `randomInt` kriptografik tasodifiy manbadan o'qiydi — taxmin qilib
 * bo'lmaydigan tarzda. Alemizki (unique) `P2002` xatosi kelsa, yangi
 * variant sinab beriladi.
 */
export async function reserveReceiptNumber(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = generateReceiptNumber();
    const taken = await prisma.payment.findUnique({
      where: { receiptNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // 5 ta urinishda ham band bo'lsa — bu deyarli imkonsiz (1/(1.1e12)^5).
  // Kutilmasak xato tushamiz: chek raqamisiz to'lov yaratish yaxshiroq.
  throw new Error('RECEIPT_NUMBER_EXHAUSTED');
}
