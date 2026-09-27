import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { api, resetDb, auth, loginViaApi, registerViaApi, nextIp, prisma } from './helpers';
import { generateTotp } from '../../utils/totp';
import { isProduction, isNonProduction } from '../../config/runtime';
import { totpKeyHealthy } from '../../config/securityCheck';

/**
 * SMTP xatosi holatini sun'iy ravishda keltirish uchun. `vi.hoisted` —
 * `vi.mock` factory'si hoisting qilinsa ham o'zgaruvchiga kirish imkonini beradi.
 */
const mailState = vi.hoisted(() => ({ shouldFail: false }));

// Faqat `sendEmail` almashtiriladi; qolgan hammasi haqiqiy (importOriginal).
vi.mock('../../lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/mailer')>();
  return {
    ...actual,
    sendEmail: (to: string, subject: string, html: string, text?: string) => {
      if (mailState.shouldFail) {
        return Promise.reject(new Error('SMTP TEST: ataylab xato'));
      }
      return actual.sendEmail(to, subject, html, text);
    },
  };
});

/**
 * F8 + F9 + muhit (runtime) qat'iyligi — "fail closed" regression testlari.
 *
 * Bu fayl 3 ta real hodisani qamrab oladi:
 *  1) TOTP_AT_REST_KEY yo'q bo'lganda 2FA "qamalab" qolmasligi (backup kod ishlashi)
 *  2) forgot-password user enumeration yo'qligi (barcha holatlar bir xil javob)
 *  3) NODE_ENV belgilanmagan muhit PRODUCTION deb hisoblanishi
 */
describe('E2E: Xavfsizlik chidamligi (F8/F9/runtime)', () => {
  const email = 'resilience-user@e2e.test';
  let savedKey: string | undefined;

  beforeAll(async () => {
    savedKey = process.env.TOTP_AT_REST_KEY;
    await resetDb();
  });

  afterAll(() => {
    // Kalitni qaytarib qo'yamiz — keyingi test fayllari 2Faga bog'liq.
    if (savedKey === undefined) delete process.env.TOTP_AT_REST_KEY;
    else process.env.TOTP_AT_REST_KEY = savedKey;
  });

  // ==========================================================================
  // 1) RUNTIME: NODE_ENV belgilanmagan bo'lsa — production (fail-safe)
  // ==========================================================================
  describe('runtime aniqlash (fail-safe)', () => {
    const original = process.env.NODE_ENV;

    afterAll(() => {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    });

    it('NODE_ENV yo\'q -> production (xavfsiz tomon)', () => {
      delete process.env.NODE_ENV;
      expect(isProduction()).toBe(true);
      expect(isNonProduction()).toBe(false);
    });

    it('NODE_ENV bo\'sh -> production', () => {
      process.env.NODE_ENV = '';
      expect(isProduction()).toBe(true);
    });

    it('NODE_ENV noto\'g\'ri ("prodcution" kabi xato) -> production', () => {
      process.env.NODE_ENV = 'prodcution';
      expect(isProduction()).toBe(true);
    });

    it('NODE_ENV=production -> production', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);
    });

    it('NODE_ENV=development/test -> production EMAS', () => {
      for (const v of ['development', 'dev', 'test', 'local', 'e2e']) {
        process.env.NODE_ENV = v;
        expect(isProduction()).toBe(false);
        expect(isNonProduction()).toBe(true);
      }
    });

    it('kalit tekshiruvi qiymatni chiqarmaydi', () => {
      // TOTP kaliti o\'lchovchi, qiymatni hech qayerda qaytarmaydi
      const backup = process.env.TOTP_AT_REST_KEY;
      delete process.env.TOTP_AT_REST_KEY;
      expect(totpKeyHealthy()).toBe(false);
      if (backup) process.env.TOTP_AT_REST_KEY = backup;
    });
  });

  // ==========================================================================
  // 2) F8: TOTP kaliti yo'q — backup kod orqali login uzluksiz bo'lishi kerak
  // ==========================================================================
  describe('F8: TOTP kaliti yo\'qligida 2FA qulflanmasin', () => {
    let token = '';
    let secret = '';
    let backupCodes: string[] = [];

    beforeAll(async () => {
      const reg = await registerViaApi(email, 'secret123', 'Resilience User');
      token = reg.body.data.accessToken;
      const setup = await api().post('/api/auth/2fa/setup').set('Authorization', auth(token));
      secret = setup.body.data.secret;
      const enable = await api()
        .post('/api/auth/2fa/enable')
        .set('Authorization', auth(token))
        .send({ code: generateTotp(secret) });
      backupCodes = enable.body.data.backupCodes;
      expect(backupCodes.length).toBeGreaterThanOrEqual(8);
    });

    it('2FA yoqilgan: TOTP kodi ishlaydi (kalit bor holat)', async () => {
      const login = await loginViaApi(email, 'secret123', nextIp());
      expect(login.status).toBe(202);
      const res = await api()
        .post('/api/auth/2fa/verify')
        .send({ pendingLoginToken: login.body.data.pendingLoginToken, code: generateTotp(secret) });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
    });

    it('TOTP kaliti KALIT YO\'Q: 500 emas, aniq xato (fail closed)', async () => {
      const backup = process.env.TOTP_AT_REST_KEY;
      delete process.env.TOTP_AT_REST_KEY;
      try {
        const login = await loginViaApi(email, 'secret123', nextIp());
        expect(login.status).toBe(202); // pending token beriladi
        const res = await api()
          .post('/api/auth/2fa/verify')
          .send({ pendingLoginToken: login.body.data.pendingLoginToken, code: generateTotp(secret) });
        // Kalit yo'q -> TOTP tekshirib bo'lmaydi. XATO KODI 400 bo'lishi
        // SHART (500 emas): 500 = server bug, mijozga noto'g'ri keladi.
        expect(res.status).toBe(400);
        expect(res.body.data?.accessToken).toBeUndefined();
      } finally {
        if (backup) process.env.TOTP_AT_REST_KEY = backup;
      }
    });

    it('TOTP kaliti yo\'q: BACKUP KOD bilan login ishlaydi (eng muhimi)', async () => {
      const backup = process.env.TOTP_AT_REST_KEY;
      delete process.env.TOTP_AT_REST_KEY;
      try {
        const login = await loginViaApi(email, 'secret123', nextIp());
        expect(login.status).toBe(202);

        // Bu — F8 ning asosiy regressiya testi. Avvalgi kodda
        // readTotpSecret() `throw` qilardi => 500 => foydalanuvchi login
        // ekranida QAMALAB qolardi va backup kod ham ishlashga ulurmasdi.
        const res = await api()
          .post('/api/auth/2fa/verify')
          .send({ pendingLoginToken: login.body.data.pendingLoginToken, code: backupCodes[0] });

        expect(res.status).toBe(200);
        expect(res.body.data.accessToken).toBeTruthy();
        expect(res.body.data.refreshToken).toBeTruthy();

        // backup kod bir marta ishlaydi (single-use) — qayta ishlatib bo'lmaydi
        const u = await prisma.user.findUnique({ where: { email } });
        const remaining = (u!.twoFactorBackupCodes as string[]).length;
        expect(remaining).toBe(backupCodes.length - 1);
      } finally {
        if (backup) process.env.TOTP_AT_REST_KEY = backup;
      }
    });
  });

  // ==========================================================================
  // 3) F9: forgot-password — user enumeration yo'q
  // ==========================================================================
  describe('F9: forgot-password enumeration himoyasi', () => {
    it('mavjud email va yo\'q email BIR XIL javob beradi', async () => {
      const real = await api()
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', nextIp())
        .send({ email });
      const fake = await api()
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', nextIp())
        .send({ email: 'definitely-not-exists@e2e.test' });

      expect(real.status).toBe(200);
      expect(fake.status).toBe(200);
      // XABAR — bir xil bo'lishi SHART
      expect(real.body.message).toBe(fake.body.message);
      // XATO KODI — bir xil bo'lishi SHART
      expect(real.body.code).toBe(fake.body.code);
      expect(real.body.success).toBe(fake.body.success);
    });

    it('bloklangan hisob ham bir xil javob beradi (status farqi yo\'q)', async () => {
      const blockedEmail = 'blocked-user@e2e.test';
      await registerViaApi(blockedEmail, 'secret123', 'Blocked User');
      await prisma.user.update({ where: { email: blockedEmail }, data: { status: 'BLOCKED' } });

      const res = await api()
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', nextIp())
        .send({ email: blockedEmail });
      const fake = await api()
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', nextIp())
        .send({ email: 'nobody-here@e2e.test' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(fake.body.message);
    });

    it('PRODUCTION muhitida vaqtinchalik parol API javobida QAYTMAYDI', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await api()
          .post('/api/auth/forgot-password')
          .set('X-Forwarded-For', nextIp())
          .send({ email });
        expect(res.status).toBe(200);
        // ENG MUHIM: parol hech qanday holda javobda ko'rinmasin
        expect(res.body.data).toBeNull();
        expect(JSON.stringify(res.body)).not.toContain('devTempPassword');
      } finally {
        process.env.NODE_ENV = original;
      }
    });

    it('NODE_ENV BELGILANMAGAN holda ham parol qaytmaydi (fail-safe)', async () => {
      const original = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      try {
        const res = await api()
          .post('/api/auth/forgot-password')
          .set('X-Forwarded-For', nextIp())
          .send({ email });
        expect(res.status).toBe(200);
        expect(res.body.data).toBeNull();
        expect(JSON.stringify(res.body)).not.toContain('devTempPassword');
      } finally {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
      }
    });

    it('SMTP xatosi ham bir xil javob beradi + mustChangePassword tozalanadi', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      mailState.shouldFail = true; // SMTP ataylab xato beradi
      try {
        const res = await api()
          .post('/api/auth/forgot-password')
          .set('X-Forwarded-For', nextIp())
          .send({ email });
        const fake = await api()
          .post('/api/auth/forgot-password')
          .set('X-Forwarded-For', nextIp())
          .send({ email: 'still-not-exists@e2e.test' });

        // SMTP xatoligida ham 200 + bir xil xabar (500 emas!)
        expect(res.status).toBe(200);
        expect(res.body.message).toBe(fake.body.message);
        expect(res.body.code).toBe(fake.body.code);
        expect(res.body.data).toBeNull();

        // ROLLBACK: barcha vaqtinchalik maydonlar tozalanishi kerak
        const u = await prisma.user.findUnique({ where: { email } });
        expect(u!.tempPasswordHash).toBeNull();
        expect(u!.tempPasswordExpiresAt).toBeNull();
        // Eski kodda bu tozalanmagan edi -> keyingi parol o'zgartirishda
        // "eski parol" talabi bekor bo'lib ketardi.
        expect(u!.mustChangePassword).toBe(false);
      } finally {
        mailState.shouldFail = false;
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
      }
    });
  });

  // ==========================================================================
  // 4) Rate limit — yangi himoyalangan endpointlar
  // ==========================================================================
  describe('Rate limit (auth/payment)', () => {
    it('/api/auth/refresh cheklangan (IP bo\'yicha)', async () => {
      const ip = nextIp();
      let limited = false;
      // Limit 60/15min — 65 ta so'rov bilan chegarani oshish kutiladi.
      for (let i = 0; i < 65; i += 1) {
        const res = await api()
          .post('/api/auth/refresh')
          .set('X-Forwarded-For', ip)
          .send({ refreshToken: 'not-a-real-token' });
        if (res.status === 429) {
          limited = true;
          break;
        }
      }
      expect(limited).toBe(true);
    });

    it('/api/auth/reset-password cheklangan', async () => {
      const ip = nextIp();
      let limited = false;
      for (let i = 0; i < 15; i += 1) {
        const res = await api()
          .post('/api/auth/reset-password')
          .set('X-Forwarded-For', ip)
          .send({ token: 'x', newPassword: 'secret123' });
        if (res.status === 429) {
          limited = true;
          break;
        }
      }
      expect(limited).toBe(true);
    });
  });
});
