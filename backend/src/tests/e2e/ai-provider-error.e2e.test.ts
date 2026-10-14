import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { api, auth, registerViaApi } from './helpers';
import { config } from '../../config';

/**
 * AI PROVIDER XATOSI vs NOMA'LUM SAVOL — B3 REGRESSION TESTI
 * =====================================================================
 * Qoida:
 *   • Kalit yo'q (AI not configured)  → halol "texnik nosozlik" (AI_NOT_CONFIGURED).
 *   • Kalit BOR, lekin provider xato qildi → sababni yashirib "tushunmadim"
 *     deb JAVOB BERILMAYDI — aniq vaqtinchalik xato xabari qaytadi.
 *   • Provider xato qilganda HAM qoidaviy savollar (salom, narx) ishlaydi.
 * Testda haqiqiy tarmoqqa chiqilmaydi: OPENAI_BASE_URL ishlamaydigan
 * lokal manzilga qaratiladi (fetch tez rad etiladi).
 */

// E2E'da barcha kalitlar bo'sh (setup.ts) — providerFailed holatini
// yaratish uchun faqat openai kalitini vaqtincha yoqamiz.
const saved = { key: '', base: '' };
let seeded = false;

function seedFailingProvider() {
  if (!seeded) {
    saved.key = config.ai.openaiApiKey;
    saved.base = config.ai.openaiBaseUrl;
    seeded = true;
  }
  config.ai.openaiApiKey = 'e2e-dummy-key-not-a-real-secret';
  config.ai.openaiBaseUrl = 'http://127.0.0.1:9/v1'; // discard port — rad etiladi
}

afterEach(() => {
  if (seeded) {
    config.ai.openaiApiKey = saved.key;
    config.ai.openaiBaseUrl = saved.base;
    seeded = false;
  }
});

describe('E2E: AI provider xatosi ≠ noma\'lum savol fallback', () => {
  let token = '';

  beforeAll(async () => {
    const u = await registerViaApi('ai-fb1@e2e.test', 'secret123', 'AI FB One');
    token = u.body.data.accessToken;
  });

  it('kalit yo\'q: noma\'lum savol halol AI_NOT_CONFIGURED beradi ("tushunmadim" emas)', async () => {
    const res = await api()
      .post('/api/ai/chat')
      .set('Authorization', auth(token))
      .send({ message: 'Ziggurat protokoli qanday sinxronlashadi?' });
    expect(res.status).toBe(200);
    const reply = String(res.body.data.reply);
    expect(reply).not.toContain('buni aniq tushunmadim');
    // Kalitlar bo'sh → holol konfiguratsiya xatosi
    expect(reply).toContain('texnik nosozlik');
  });

  it('kalit BOR, provider xato qildi: "tushunmadim" EMAS, aniq vaqtinchalik xato', async () => {
    const u = await registerViaApi('ai-fb2@e2e.test', 'secret123', 'AI FB Two');
    seedFailingProvider();

    const res = await api()
      .post('/api/ai/chat')
      .set('Authorization', auth(u.body.data.accessToken))
      .send({ message: 'Kvant emulyatsiyasi qanday boshqariladi?' });
    expect(res.status).toBe(200);
    const reply = String(res.body.data.reply);
    // Sabab yashirilmaydi:
    expect(reply).not.toContain('buni aniq tushunmadim');
    expect(reply).toContain('vaqtinchalik nosozlik');
    expect(res.body.data.model).toBe('fallback');
  });

  it('provider xato qilganda HAM qoidaviy savollar (salom) ishlaydi', async () => {
    const u = await registerViaApi('ai-fb3@e2e.test', 'secret123', 'AI FB Three');
    seedFailingProvider();

    const res = await api()
      .post('/api/ai/chat')
      .set('Authorization', auth(u.body.data.accessToken))
      .send({ message: 'salom' });
    expect(res.status).toBe(200);
    const reply = String(res.body.data.reply);
    // Salomlashuv provider'ga bog'liq emas — real qoidaviy javob qaytadi
    expect(reply.toLowerCase()).toContain('salom');
    expect(reply).not.toContain('vaqtinchalik nosozlik');
  });

  it('API key hech qachon javobga/inline xatolarga tushmaydi', async () => {
    const u = await registerViaApi('ai-fb4@e2e.test', 'secret123', 'AI FB Four');
    seedFailingProvider();

    const res = await api()
      .post('/api/ai/chat')
      .set('Authorization', auth(u.body.data.accessToken))
      .send({ message: 'Xatolik haqida ma\'lumot bera olasizmi?' });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('e2e-dummy-key-not-a-real-secret');
    expect(raw).not.toMatch(/sk-|AIza|Bearer /);
  });
});
