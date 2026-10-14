import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * I18N REGRESSION TESTI — dashboard.bookingStatus
 * =====================================================================
 * Root cause (2026-10-14): BookingStatus turida 8 ta holat bor
 * (PENDING, PENDING_PAYMENT, PARTIALLY_PAID, PAID, CONFIRMED, ACTIVE,
 * COMPLETED, CANCELLED), lekin tarjima fayllarida faqat 5 tasi edi —
 * `PAID` ko'rinmagan joyda xom kalit ("bookingStatus.PAID") chiqardi.
 * Barcha tillarda BARCHA holatlar majburiy.
 */

const STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PAID',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
] as const;

const LOCALES = ['uz', 'en', 'ru'] as const;

// frontend/messages — backend rootidan bir daraja yuqorida
function loadMessages(locale: string): Record<string, unknown> {
  const p = resolve(process.cwd(), '..', 'frontend', 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
}

function dig(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

describe('i18n: dashboard.bookingStatus — barcha tillarda barcha statuslar', () => {
  for (const locale of LOCALES) {
    it(`${locale}.json: barcha BookingStatus kalitlari mavjud va bo'sh emas`, () => {
      const messages = loadMessages(locale);
      const section = dig(messages, ['dashboard', 'bookingStatus']);
      expect(section).toBeTruthy();
      for (const status of STATUSES) {
        const value = (section as Record<string, unknown>)[status];
        expect(typeof value, `${locale}.dashboard.bookingStatus.${status}`).toBe('string');
        expect(String(value).trim().length, `${locale}.dashboard.bookingStatus.${status}`).toBeGreaterThan(0);
        // Xom kalit ko'rinmasligi kerak (masalan "PAID" aynan shunday emas)
        expect(String(value), `${locale}.${status}`).not.toBe(status);
      }
    });

    it(`${locale}.json: JSON yaroqli va yagona PAID ma'nosi (To'langan/Paid/Оплачено)`, () => {
      const messages = loadMessages(locale);
      const section = dig(messages, ['dashboard', 'bookingStatus']) as Record<string, string>;
      // "PAID" — to'liq to'langan holat, boshqa status ma'nolari bilan aralashmasligi kerak
      expect(section.PAID).toBeTruthy();
      expect(section.PAID).not.toBe(section.PENDING);
      expect(section.PAID).not.toBe(section.CANCELLED);
    });
  }
});
