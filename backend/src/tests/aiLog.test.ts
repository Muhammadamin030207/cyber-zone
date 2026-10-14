import { describe, it, expect } from 'vitest';
import { sanitizeAiLog } from '../utils/aiLog';

/**
 * AI provider xatolari konsolga yozilishidan OLDIN maxfiy qismlar olib
 * tashlanishi kerak (B2 talabi): URL kaliti, Bearer token, provider kalitlari.
 * Bu — log-leak REGRESSION testi.
 */
describe('sanitizeAiLog — logdan maxfiy ma\'lumotlarni tozalash', () => {
  it('Gemini URL kalitini (?key=) yashiradi', () => {
    const out = sanitizeAiLog('POST https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent?key=AIzaSySECRET1234567890 -> 400');
    expect(out).not.toContain('AIzaSySECRET1234567890');
    expect(out).toContain('key=***');
  });

  it('Bearer tokenni yashiradi', () => {
    const out = sanitizeAiLog('Authorization: Bearer sk-abc123DEF456 failed');
    expect(out).not.toContain('sk-abc123DEF456');
    expect(out).toContain('Bearer ***');
  });

  it('yalang\'och OpenAI/Anthropic kalitlarini yashiradi', () => {
    expect(sanitizeAiLog('header sk-ant-api03-VERYSECRET value')).not.toContain('VERYSECRET');
    expect(sanitizeAiLog('key sk-proj-VERYSECRET2 value')).not.toContain('VERYSECRET2');
  });

  it('oddiy xato matnini buzmaydi va uzunlikni cheklaydi', () => {
    const out = sanitizeAiLog('fetch failed: ECONNREFUSED', 200);
    expect(out).toContain('ECONNREFUSED');
    expect(sanitizeAiLog('x'.repeat(500), 200).length).toBe(200);
  });

  it('string bo\'lmagan qiymatni xavfsiz qayta ishlaydi', () => {
    expect(sanitizeAiLog(undefined)).toBe('');
    expect(sanitizeAiLog(null)).toBe('');
    expect(sanitizeAiLog(42 as unknown)).toBe('42');
  });
});
