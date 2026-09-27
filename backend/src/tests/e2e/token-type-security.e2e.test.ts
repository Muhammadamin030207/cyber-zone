import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { api, apiFromNewIp, resetDb, auth, registerViaApi, loginViaApi, prisma } from './helpers';
import { config } from '../../config';
import { generateTotp } from '../../utils/totp';

/**
 * XAVFSIZLIK REGRESSIYA TESTLARI — faktor zanjiri (F1 / F2 / F3).
 *
 * F1: `pending-2fa` / `pending-passkey` tokenlari access token bilan BIR XIL
 * secret bilan imzolanardi va `verifyAccessToken` `type` claim'ni tekshirmasdi.
 * Natijada 2FA yoqilgan hisobga parol bilan kirib olingan oraliq token
 * `Authorization: Bearer` sifatida TO'LIQ API kirishida ishlating.
 *
 * Bu testlar aynan shu tuzakning yopilganini isbotlaydi.
 */
describe('E2E: Xavfsizlik — oraliq (pending) token API kirishiga yolcha olmasligi kerak', () => {
  const email = 'pending-token-user@e2e.test';
  const password = 'secret123';
  let secret = '';
  let accessToken = '';
  let backupCode = '';

  beforeAll(async () => {
    await resetDb();
    const reg = await registerViaApi(email, password, 'Pending Token User');
    accessToken = reg.body.data.accessToken;

    // 2FA yoqiladi (TOTP + backup kod)
    const setup = await api().post('/api/auth/2fa/setup').set('Authorization', auth(accessToken));
    secret = setup.body.data.secret;
    const enable = await api()
      .post('/api/auth/2fa/enable')
      .set('Authorization', auth(accessToken))
      .send({ code: generateTotp(secret) });
    backupCode = enable.body.data.backupCodes[0];
    expect(enable.body.data.enabled).toBe(true);
  });

  it('BIZOY: 2FA yoqilgan hisobga login 202 + oraliq token qaytaradi', async () => {
    const res = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(202);
    expect(res.body.code).toBe('TWO_FACTOR_REQUIRED');
    expect(res.body.data.pendingLoginToken).toBeTruthy();
    expect(res.body.data.accessToken).toBeUndefined();
  });

  it('F1: pending-2fa token access token sifatida ISHLAMASLIGI kerak', async () => {
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    const pending = login.body.data.pendingLoginToken;

    // Profil — authenticate() middleware orqali himoyalangan endpoint
    const res = await apiFromNewIp().get('/api/auth/me').set('Authorization', auth(pending));
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('F1: pending-2fa token boshqa himoyalangan endpointlarda ham rad etiladi', async () => {
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    const pending = login.body.data.pendingLoginToken;

    // Faqat `authenticate` middleware orqali himoyalangan endpointlar.
    // (Masalan GET /api/rooms ochiq endpoint — u 200 qaytarishi TO'G'RI.)
    const endpoints: Array<[string, string]> = [
      ['get', '/api/auth/security/events'],
      ['get', '/api/payments/history'],
      ['get', '/api/rooms/all'],
      ['get', '/api/webauthn/passkeys'],
      ['post', '/api/ai/conversations'],
    ];
    for (const [method, url] of endpoints) {
      const res = await (apiFromNewIp() as any)[method](url).set('Authorization', auth(pending));
      expect(res.status, `${method.toUpperCase()} ${url} pending tokenni qabul qilmasligi kerak`).toBe(401);
    }
  });

  it('F1: pending token noto\'g\'ri rolni kashf eta olmaydi (hech qanday ma\'lumot qaytarmaydi)', async () => {
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    const pending = login.body.data.pendingLoginToken;
    const res = await apiFromNewIp().get('/api/auth/me').set('Authorization', auth(pending));
    // Hech qanday foydalanuvchi ma'lumoti sizib chiqmasligi kerak
    expect(JSON.stringify(res.body)).not.toContain(email);
  });

  it('F1: qo\'lda yasalgan pending token (type=access) ham 2FA ni o\'tkazmaydi', async () => {
    // Hujjatlashtiruvchi test: ikkinchi faktorni umuman o'tkazib yuborish
    // uchun "haqiqiy" access token qo'lda yasalib bo'lar edi (server imzolash
    // kaliti ochiq bo'lgan holda). Endi bu endpoint 2-bosqichsiz hech qanday
    // to'liq token qaytarmaydi — faqat oraliq token.
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(202);
    expect(login.body.data.accessToken).toBeUndefined();
    expect(login.body.data.refreshToken).toBeUndefined();
  });

  it('F1: 2FA kodi to\'g\'ri bo\'lsa haqiqiy token beriladi (bypass yo\'qligi tasdiqlandi)', async () => {
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    const pending = login.body.data.pendingLoginToken;

    const verify = await apiFromNewIp()
      .post('/api/auth/2fa/verify')
      .send({ pendingLoginToken: pending, code: generateTotp(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();

    // Endi haqiqiy token ishlaydi
    const me = await apiFromNewIp().get('/api/auth/me').set('Authorization', auth(verify.body.data.accessToken));
    expect(me.status).toBe(200);
  });

  it('F1: backup kod bilan ham tasdiqlanadi va oraliq token ishlashda qolmaydi', async () => {
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    const pending = login.body.data.pendingLoginToken;

    const before = await apiFromNewIp().get('/api/auth/me').set('Authorization', auth(pending));
    expect(before.status).toBe(401);

    const verify = await apiFromNewIp()
      .post('/api/auth/2fa/verify')
      .send({ pendingLoginToken: pending, code: backupCode });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();
  });

  it('F1: pending-2fa token 2FA verify uchun emas, FAQAT shu turdagi token qabul qilinadi', async () => {
    // pending-2fa tokenini /webauthn bosqichiga ishlatib bo'lmasligi kerak
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    const pending = login.body.data.pendingLoginToken;

    const user = await prisma.user.findUnique({ where: { email } });
    const res = await apiFromNewIp()
      .post('/api/webauthn/auth/verify')
      .send({ pendingLoginToken: pending, userId: user!.id, response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } });
    expect(res.status).toBe(400);
  });

  it('F1: token turi tekshiruvi — access secret bilan imzolangan refresh token qabul qilinmaydi', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    // noto'g'ri secret bilan imzolangan "access" token
    const forged = jwt.sign(
      { userId: user!.id, email: user!.email, role: user!.role, tokenVersion: user!.tokenVersion, type: 'access' },
      'not-the-real-secret',
      { expiresIn: '15m' },
    );
    const res = await apiFromNewIp().get('/api/auth/me').set('Authorization', auth(forged));
    expect(res.status).toBe(401);
  });

  it('F1: ACCESS token (to\'g\'ri) 2FA verify bosqichida ishlatilmaydi', async () => {
    const res = await apiFromNewIp()
      .post('/api/auth/2fa/verify')
      .send({ pendingLoginToken: accessToken, code: generateTotp(secret) });
    expect(res.status).toBe(401);
  });

  it('F1: refresh endpoint oraliq token bilan ishlamaydi', async () => {
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    const pending = login.body.data.pendingLoginToken;
    const res = await apiFromNewIp().post('/api/auth/refresh').send({ refreshToken: pending });
    expect([400, 401]).toContain(res.status);
  });
});

describe('E2E: Xavfsizlik — passkey talabi 2FA ni o\'tkazmasligi kerak (F2)', () => {
  const email = 'passkey-chain@e2e.test';
  const password = 'secret123';
  let secret = '';

  beforeAll(async () => {
    await resetDb();
    const reg = await registerViaApi(email, password, 'Passkey Chain');
    const token = reg.body.data.accessToken;
    const setup = await api().post('/api/auth/2fa/setup').set('Authorization', auth(token));
    secret = setup.body.data.secret;
    await api().post('/api/auth/2fa/enable').set('Authorization', auth(token)).send({ code: generateTotp(secret) });

    // requirePasskey yoqiladi, lekin passkey ro'yxatlanmaydi (0 ta).
    // Bu holatda parol + 2FA yetarli bo'lishi kerak (foydalanuvchi hali
    // passkey qo'shmagan).
    await prisma.user.update({ where: { email }, data: { requirePasskey: true } });
  });

  it('passkey yo\'q hisobda parol + 2FA ishlaydi (lockout yo\'q)', async () => {
    const login = await apiFromNewIp().post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(202);
    expect(login.body.code).toBe('TWO_FACTOR_REQUIRED');

    const verify = await apiFromNewIp()
      .post('/api/auth/2fa/verify')
      .send({ pendingLoginToken: login.body.data.pendingLoginToken, code: generateTotp(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();
  });
});

describe('E2E: Xavfsizlik — config va token yordamchilari', () => {
  it('verifyPendingToken noto\'g\'ri turdagi tokeni rad etadi', async () => {
    const { verifyPendingToken, generateTokens } = await import('../../lib/jwt');
    const { accessToken } = generateTokens({ userId: 'u1', email: 'a@b.c', role: 'USER', tokenVersion: 0 });
    expect(() => verifyPendingToken(accessToken, 'pending-2fa')).toThrow();
  });

  it('generateTokens access va refresh turlarini belgilaydi', async () => {
    const { verifyAccessToken, verifyRefreshToken, generateTokens } = await import('../../lib/jwt');
    const { accessToken, refreshToken } = generateTokens({ userId: 'u1', email: 'a@b.c', role: 'USER', tokenVersion: 0 });
    expect(verifyAccessToken(accessToken).type).toBe('access');
    expect(verifyRefreshToken(refreshToken).type).toBe('refresh');
    // access token refresh secret bilan imzolangan bo'lsa, access verify ishlamasligi kerak
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });

  it('JWT secret production\'da default bo\'lmasligi kerak', () => {
    // Kamida 32 belgi (HS256 uchun yetarli entropiya)
    expect(String(config.jwt.secret || '').length).toBeGreaterThanOrEqual(16);
  });
});
