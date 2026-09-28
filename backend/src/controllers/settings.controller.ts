import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { ok, badRequest, serverError } from '../utils/response';
import type { AuthRequest } from '../types';

// Ruxsat etilgan kalitlar (§6.16) — faqat shular admin panel orqali boshqariladi.
export const SITE_SETTING_KEYS = [
  'faq',
  'contact_phone',
  'contact_email',
  'address',
  'work_hours_note',
  'payment_info',
  'cancellation_policy',
  'how_to_book',
  // Dogaon (merchant) karta ma'lumotlari — qo'lda o'tkazma to'lov uchun
  'payment_card_number',
  'payment_card_holder',
  'payment_card_bank',
  'payment_card_note',
  // Usulga (method) bog'langan dogaon kartalari — JSON. Har bir to'lov usuli
  // uchun alohida karta: {"UZUM":{...},"UZCARD":{...},"DEFAULT":{...}}.
  // `payment_card_*` (legacy) saqlanadi — `DEFAULT` bo'sh bo'lsa u ishlatiladi.
  'payment_cards_by_method',
  // Kamerali yuz tekshiruvi (liveness) talabi: 'on' (default) yoki 'off'.
  // Sindiki buyruq: mijoz sessiyani boshlashdan oldin kamerada 3 marta ko'z
  // pirpirashi shart. Kamera bo'lmagan holatlar (masalan tayyor binoda naqd
  // qabul) uchun admin uni o'chirishi mumkin.
  'identity.faceCheckRequired',
] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

/**
 * Ommaviy (public) GET'da KO'RINMAYDIGAN kalitlar.
 * Karta raqami hamma uchun ochiq bo'lsa — bot skraper yig'ib oladi va so'rov
 * bo'g'ini ochiladi. Faqat AUTENTIFIKATSIYALangan foydalanuvchi (baroni bor
 * foydalanuvchi) uni ko'radi — GET /api/payments/merchant-card orqali.
 */
export const PRIVATE_SITE_SETTING_KEYS: readonly string[] = [
  'payment_card_number',
  'payment_card_holder',
  'payment_card_bank',
  'payment_card_note',
  'payment_cards_by_method',
];

export const SITE_SETTING_MAX_LENGTH: Record<SiteSettingKey, number> = {
  faq: 12000,
  how_to_book: 6000,
  work_hours_note: 2000,
  payment_info: 3000,
  cancellation_policy: 3000,
  contact_phone: 200,
  contact_email: 200,
  address: 500,
  payment_card_number: 40,
  payment_card_holder: 120,
  payment_card_bank: 120,
  payment_card_note: 500,
  // 6 usul x 3 maydon — JSON uchun joy.
  payment_cards_by_method: 4000,
  'identity.faceCheckRequired': 8,
};

// ============ GET /api/settings/site — PUBLIC: AI va UI konteksti uchun ============
export async function getSiteSettings(_req: Request, res: Response) {
  try {
    // Karta ma'lumotlari OMMAVIY RO'YXATGA KIRMAYDI (faqat authenticated endpoint).
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: SITE_SETTING_KEYS.filter((k) => !PRIVATE_SITE_SETTING_KEYS.includes(k)) } },
    });
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return ok(res, { settings });
  } catch (err) {
    return serverError(res, 'Settings o\'qishda xatolik');
  }
}

// ============ GET /api/settings/site/admin — ADMIN: KARTA KALITLARI HAM ============
// Ommaviy GET maxfiylik uchun karta kalitlarini yashiradi. Admin panelda esa
// ularni tahrirlash kerak — shuning uchun alohida, faqat ADMIN/SUPER_ADMIN
// ga ochiq endpoint. Xavfsizlik: `authenticate` + `authorize` middleware'lari
// majburiy, karta raqamlari hech qanday ommaviy ro'yxatga chiqmaydi.
export async function getAdminSiteSettings(_req: AuthRequest, res: Response) {
  try {
    const rows = await prisma.siteSetting.findMany({ where: { key: { in: [...SITE_SETTING_KEYS] } } });
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return ok(res, { settings });
  } catch (err) {
    return serverError(res, 'Settings o\'qishda xatolik');
  }
}

// ============ PUT /api/settings/site — ADMIN/SUPER_ADMIN: faqat ruxsat kalitlar ============
export async function updateSiteSettings(req: AuthRequest, res: Response) {
  try {
    const body = req.body?.value ?? req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest(res, 'Body: { key: "qiymat", ... } obyekti kerak');
    }

    const updates: { key: string; value: string }[] = [];
    for (const [key, raw] of Object.entries(body)) {
      if (!SITE_SETTING_KEYS.includes(key as SiteSettingKey)) continue; // noma'lum kalit — o'tkazib yuboriladi
      if (typeof raw !== 'string') return badRequest(res, `"${key}" qiymati matn (string) bo'lishi kerak`);
      const max = SITE_SETTING_MAX_LENGTH[key as SiteSettingKey];
      const value = raw.trim();
      if (value.length > max) return badRequest(res, `"${key}" juda uzun (maks. ${max} belgi)`);
      updates.push({ key, value });
    }

    if (!updates.length) return badRequest(res, 'Yangilanadigan kalit topilmadi');

    for (const u of updates) {
      await prisma.siteSetting.upsert({
        where: { key: u.key },
        update: { value: u.value, updatedBy: req.user?.userId },
        create: { key: u.key, value: u.value, updatedBy: req.user?.userId },
      });
    }

    const rows = await prisma.siteSetting.findMany({ where: { key: { in: [...SITE_SETTING_KEYS] } } });
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;

    return ok(res, { settings }, 'Sayt ma\'lumotlari saqlandi');
  } catch (err) {
    return serverError(res, 'Settings saqlashda xatolik');
  }
}