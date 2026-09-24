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
] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export const SITE_SETTING_MAX_LENGTH: Record<SiteSettingKey, number> = {
  faq: 12000,
  how_to_book: 6000,
  work_hours_note: 2000,
  payment_info: 3000,
  cancellation_policy: 3000,
  contact_phone: 200,
  contact_email: 200,
  address: 500,
};

// ============ GET /api/settings/site — PUBLIC: AI va UI konteksti uchun ============
export async function getSiteSettings(_req: Request, res: Response) {
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