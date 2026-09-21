import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, loginViaApi, registerViaApi, nextIp, prisma } from './helpers';
import { generateTotp } from '../../utils/totp';

describe('E2E: Two-factor authentication (TOTP + backup codes)', () => {
  let token = '';
  let secret = '';
  let backupCodes: string[] = [];
  const email = 'twofa-user@e2e.test';

  beforeAll(async () => {
    await resetDb();
    const reg = await registerViaApi(email, 'secret123', 'TwoFA User');
    token = reg.body.data.accessToken;
  });

  it('setup: secret va otpauth URL qaytaradi', async () => {
    const res = await api().post('/api/auth/2fa/setup').set('Authorization', auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.secret).toBeTruthy();
    expect(res.body.data.otpauthUrl).toContain('otpauth://totp/');
    secret = res.body.data.secret;
  });

  it('enable: noto\'g\'ri kod rad etiladi', async () => {
    const res = await api().post('/api/auth/2fa/enable').set('Authorization', auth(token)).send({ code: '000000' });
    expect(res.status).toBe(400);
    const u = await prisma.user.findUnique({ where: { email } });
    expect(u!.twoFactorEnabled).toBe(false);
  });

  it('enable: to\'g\'ri TOTP kodi bilan yoqiladi va backup kodlar beriladi', async () => {
    const code = generateTotp(secret);
    const res = await api().post('/api/auth/2fa/enable').set('Authorization', auth(token)).send({ code });
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(Array.isArray(res.body.data.backupCodes)).toBe(true);
    expect(res.body.data.backupCodes.length).toBeGreaterThanOrEqual(8);
    backupCodes = res.body.data.backupCodes;

    const u = await prisma.user.findUnique({ where: { email } });
    expect(u!.twoFactorEnabled).toBe(true);
    expect(u!.twoFactorConfirmedAt).not.toBeNull();
    // Backup kodlar hash'langan (plain text emas)
    const stored = u!.twoFactorBackupCodes as string[];
    expect(stored[0]).not.toBe(backupCodes[0]);
  });

  it('login: 2FA yoqilgan hisobda parol yetarli emas — pending token qaytadi', async () => {
    const res = await loginViaApi(email, 'secret123', nextIp());
    expect(res.status).toBe(202);
    expect(res.body.code).toBe('TWO_FACTOR_REQUIRED');
    expect(res.body.data.pendingLoginToken).toBeTruthy();
    expect(res.body.data.accessToken).toBeUndefined();
  });

  it('verify: noto\'g\'ri kod rad etiladi, to\'g\'ri kod token beradi', async () => {
    const login = await loginViaApi(email, 'secret123', nextIp());
    const pending = login.body.data.pendingLoginToken;

    const bad = await api().post('/api/auth/2fa/verify').set('X-Forwarded-For', nextIp()).send({ pendingLoginToken: pending, code: '111111' });
    expect(bad.status).toBe(400);

    const good = await api().post('/api/auth/2fa/verify').set('X-Forwarded-For', nextIp()).send({ pendingLoginToken: pending, code: generateTotp(secret) });
    expect(good.status).toBe(200);
    expect(good.body.data.accessToken).toBeTruthy();

    const me = await api().get('/api/auth/me').set('Authorization', auth(good.body.data.accessToken));
    expect(me.status).toBe(200);
  });

  it('recovery: backup kod bir marta ishlaydi, keyin iste\'mol qilinadi', async () => {
    const login = await loginViaApi(email, 'secret123', nextIp());
    const pending = login.body.data.pendingLoginToken;

    const useCode = backupCodes[0];
    const first = await api().post('/api/auth/2fa/verify').set('X-Forwarded-For', nextIp()).send({ pendingLoginToken: pending, code: useCode });
    expect(first.status).toBe(200);

    const login2 = await loginViaApi(email, 'secret123', nextIp());
    const pending2 = login2.body.data.pendingLoginToken;
    const second = await api().post('/api/auth/2fa/verify').set('X-Forwarded-For', nextIp()).send({ pendingLoginToken: pending2, code: useCode });
    expect(second.status).toBe(400);

    const u = await prisma.user.findUnique({ where: { email } });
    expect((u!.twoFactorBackupCodes as string[]).length).toBe(backupCodes.length - 1);
  });

  it('status: enabled va qolgan backup kodlar soni', async () => {
    const res = await api().get('/api/auth/2fa/status').set('Authorization', auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.backupCodesRemaining).toBe(backupCodes.length - 1);
  });

  it('disable: noto\'g\'ri parol rad etiladi, to\'g\'ri parol o\'chiradi va sessiyani yangilaydi', async () => {
    const before = await prisma.user.findUnique({ where: { email } });

    const bad = await api().post('/api/auth/2fa/disable').set('Authorization', auth(token)).send({ password: 'wrong' });
    expect(bad.status).toBe(400);

    const good = await api().post('/api/auth/2fa/disable').set('Authorization', auth(token)).send({ password: 'secret123' });
    expect(good.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { email } });
    expect(after!.twoFactorEnabled).toBe(false);
    expect(after!.twoFactorSecret).toBeNull();
    expect(after!.tokenVersion).toBe(before!.tokenVersion + 1);

    // Eski token bekor bo'ldi (tokenVersion oshdi)
    const me = await api().get('/api/auth/me').set('Authorization', auth(token));
    expect(me.status).toBe(401);

    // Endi oddiy login token beradi
    const login = await loginViaApi(email, 'secret123', nextIp());
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
  });
});
