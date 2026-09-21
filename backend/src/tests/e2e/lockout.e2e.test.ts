import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { api, resetDb, auth, loginViaApi, nextIp, prisma, createUserDirect } from './helpers';
import { buildTestApp } from './app';
import { config } from '../../config';

const MAX = config.security.loginMaxAttempts;

async function failLoginTimes(email: string, ip: string, times: number) {
  let last: any = null;
  for (let i = 0; i < times; i += 1) {
    last = await api().post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, password: 'wrong-password' });
  }
  return last;
}

describe('E2E: Login lockout — individual, escalation, persistence', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('MAX-1 xato: hali bloklanmagan, remainingAttempts kamayadi', async () => {
    await createUserDirect({ email: 'lock-a@e2e.test', password: 'correct-pass' });
    const ip = nextIp();
    const last = await failLoginTimes('lock-a@e2e.test', ip, MAX - 1);
    expect(last.status).toBe(400);
    expect(last.body.code).toBe('INVALID_CREDENTIALS');
    expect(last.body.remainingAttempts).toBe(1);

    const u = await prisma.user.findUnique({ where: { email: 'lock-a@e2e.test' } });
    expect(u!.loginLockedUntil).toBeNull();
    expect(u!.failedLoginAttempts).toBe(MAX - 1);
  });

  it('MAX xato: hisob bloklanadi (stage 0 -> 1-soat) va lockedUntil DB\'da saqlanadi', async () => {
    const ip = nextIp();
    const before = Date.now();
    const last = await failLoginTimes('lock-a@e2e.test', ip, 1);
    expect(last.status).toBe(429);
    expect(last.body.code).toBe('ACCOUNT_LOCKED');
    // 1-bosqich: 60 daqiqa = 3600 sekund
    expect(last.body.retryAfterSeconds).toBeGreaterThan(3590);
    expect(last.body.retryAfterSeconds).toBeLessThanOrEqual(3600);

    const u = await prisma.user.findUnique({ where: { email: 'lock-a@e2e.test' } });
    expect(u!.loginLockedUntil).not.toBeNull();
    expect(u!.loginLockStage).toBe(1);
    expect(u!.failedLoginAttempts).toBe(0);
    const deltaMin = (u!.loginLockedUntil!.getTime() - before) / 60000;
    expect(deltaMin).toBeGreaterThan(59.5);
    expect(deltaMin).toBeLessThan(61);
  });

  it('IZOLYATSIYA: A bloklanganda B va C bemalol kiradi', async () => {
    await createUserDirect({ email: 'lock-b@e2e.test', password: 'b-pass-123' });
    await createUserDirect({ email: 'lock-c@e2e.test', password: 'c-pass-123' });

    const b = await loginViaApi('lock-b@e2e.test', 'b-pass-123');
    const c = await loginViaApi('lock-c@e2e.test', 'c-pass-123');
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);

    // A esa hali ham bloklangan — hatto TO'G'RI parol bilan ham
    const a = await loginViaApi('lock-a@e2e.test', 'correct-pass');
    expect(a.status).toBe(429);
    expect(a.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('PERSISTENCE: yangi ilova/instansiya (browser restart) ham blokni ko\'radi', async () => {
    const app2 = buildTestApp();
    const res = await request(app2)
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'lock-a@e2e.test', password: 'correct-pass' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
    expect(res.body.lockedUntil).toBeTruthy();
  });

  it('ESKALATSIYA: 1h -> 2h -> 5h -> 24h -> 24h (stage bo\'yicha)', async () => {
    const email = 'lock-esc@e2e.test';
    await createUserDirect({ email, password: 'esc-pass' });

    const expected = [
      { stage: 0, minutes: 60 },
      { stage: 1, minutes: 120 },
      { stage: 2, minutes: 300 },
      { stage: 3, minutes: 1440 },
      { stage: 4, minutes: 1440 },
    ];

    for (const { stage, minutes } of expected) {
      // Oldingi blok tugagan deb simulyatsiya qilamiz (stage saqlanadi)
      await prisma.user.update({ where: { email }, data: { loginLockedUntil: new Date(Date.now() - 1000) } });

      const ip = nextIp();
      const res = await failLoginTimes(email, ip, MAX);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
      // retryAfterSeconds daqiqaga yaqin bo'lishi kerak
      const gotMinutes = res.body.retryAfterSeconds / 60;
      expect(gotMinutes).toBeGreaterThan(minutes - 1);
      expect(gotMinutes).toBeLessThanOrEqual(minutes);

      const u = await prisma.user.findUnique({ where: { email } });
      expect(u!.loginLockStage).toBe(Math.min(stage + 1, 4));
    }
  });

  it('RESET: blok tugagach to\'g\'ri login hisoblagichlarni nolga tushiradi', async () => {
    const email = 'lock-esc@e2e.test';
    // Blok muddati o'tgan deb belgilaymiz
    await prisma.user.update({ where: { email }, data: { loginLockedUntil: new Date(Date.now() - 1000) } });

    const ok = await loginViaApi(email, 'esc-pass');
    expect(ok.status).toBe(200);

    const u = await prisma.user.findUnique({ where: { email } });
    expect(u!.failedLoginAttempts).toBe(0);
    expect(u!.loginLockStage).toBe(0);
    expect(u!.loginLockedUntil).toBeNull();
  });

  it('UNLOCK (Alt+B): bloklangan hisob to\'g\'ri parol bilan ochiladi, xato parol bilan ochilmaydi', async () => {
    const email = 'lock-unlock@e2e.test';
    await createUserDirect({ email, password: 'unlock-pass-123' });

    // Hisobni bloklaymiz (to'liq maksimal urinish)
    const lockIp = nextIp();
    await failLoginTimes(email, lockIp, MAX);
    const locked = await prisma.user.findUnique({ where: { email } });
    expect(locked!.loginLockedUntil).not.toBeNull();

    // 1) Xato parol bilan unlock — rad etiladi, blok qoladi
    const badIp = nextIp();
    const bad = await api()
      .post('/api/auth/unlock')
      .set('X-Forwarded-For', badIp)
      .send({ email, password: 'wrong-pass' });
    expect(bad.status).toBe(400);
    const still = await prisma.user.findUnique({ where: { email } });
    expect(still!.loginLockedUntil).not.toBeNull();

    // 2) To'g'ri parol bilan unlock — blok tozalanadi
    const goodIp = nextIp();
    const good = await api()
      .post('/api/auth/unlock')
      .set('X-Forwarded-For', goodIp)
      .send({ email, password: 'unlock-pass-123' });
    expect(good.status).toBe(200);
    expect(good.body.data?.unlocked).toBe(true);

    const cleared = await prisma.user.findUnique({ where: { email } });
    expect(cleared!.loginLockedUntil).toBeNull();
    expect(cleared!.loginLockStage).toBe(0);
    expect(cleared!.failedLoginAttempts).toBe(0);

    // 3) Endi oddiy login ham muvaffaqiyatli
    const after = await loginViaApi(email, 'unlock-pass-123');
    expect(after.status).toBe(200);
  });
});
