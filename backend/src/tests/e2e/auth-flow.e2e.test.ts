import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, registerViaApi, loginViaApi, nextIp, prisma } from './helpers';

describe('E2E: Auth flow (register -> login -> profile -> logout)', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('register: noto\'g\'ri email / qisqa parol / qisqa ismni rad etadi', async () => {
    const badEmail = await api().post('/api/auth/register').send({ email: 'not-an-email', password: 'secret123', fullName: 'Test User' });
    expect(badEmail.status).toBe(400);

    const shortPass = await api().post('/api/auth/register').send({ email: 'a@b.com', password: '123', fullName: 'Test User' });
    expect(shortPass.status).toBe(400);

    const shortName = await api().post('/api/auth/register').send({ email: 'a@b.com', password: 'secret123', fullName: 'Al' });
    expect(shortName.status).toBe(400);
  });

  it('register: muvaffaqiyatli — tokenlar qaytadi, DB\'da user bor', async () => {
    const res = await registerViaApi('flow-user@e2e.test', 'secret123', 'Flow User');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('flow-user@e2e.test');
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const dbUser = await prisma.user.findUnique({ where: { email: 'flow-user@e2e.test' } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.passwordHash).not.toContain('secret123');
  });

  it('register: bir xil email bilan ikkinchi marta rad etiladi', async () => {
    const dup = await registerViaApi('flow-user@e2e.test', 'secret123', 'Flow User');
    expect(dup.status).toBe(400);
    expect(dup.body.message).toContain('allaqachon');
  });

  it('login: noto\'g\'ri parol 400, to\'g\'ri parol token beradi', async () => {
    const bad = await loginViaApi('flow-user@e2e.test', 'wrong-password');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');

    const good = await loginViaApi('flow-user@e2e.test', 'secret123');
    expect(good.status).toBe(200);
    expect(good.body.data.accessToken).toBeTruthy();
  });

  it('GET /me: token bilan ishlaydi, tokensiz 401', async () => {
    const login = await loginViaApi('flow-user@e2e.test', 'secret123');
    const token = login.body.data.accessToken as string;

    const noToken = await api().get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const me = await api().get('/api/auth/me').set('Authorization', auth(token));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('flow-user@e2e.test');
  });

  it('profile update: ism/telefon yangilanadi, email immutable (400)', async () => {
    const login = await loginViaApi('flow-user@e2e.test', 'secret123');
    const token = login.body.data.accessToken as string;

    // Email o'zgartirishga urinish rad etiladi
    const emailTry = await api()
      .put('/api/auth/profile')
      .set('Authorization', auth(token))
      .send({ fullName: 'Yangi Ism', email: 'hacked@evil.test' });
    expect(emailTry.status).toBe(400);

    // Email'siz yangilash muvaffaqiyatli
    const upd = await api()
      .put('/api/auth/profile')
      .set('Authorization', auth(token))
      .send({ fullName: 'Yangi Ism', phone: '+998901234567' });
    expect(upd.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { email: 'flow-user@e2e.test' } });
    expect(dbUser!.fullName).toBe('Yangi Ism');
    expect(dbUser!.email).toBe('flow-user@e2e.test');
  });

  it('logout: server-side sessiyani bekor qiladi — eski access/refresh token ishlamaydi', async () => {
    const login = await loginViaApi('flow-user@e2e.test', 'secret123');
    const token = login.body.data.accessToken as string;
    const refresh = login.body.data.refreshToken as string;

    const out = await api().post('/api/auth/logout').set('Authorization', auth(token));
    expect(out.status).toBe(200);

    const meAfter = await api().get('/api/auth/me').set('Authorization', auth(token));
    expect(meAfter.status).toBe(401);

    const refreshAfter = await api().post('/api/auth/refresh').send({ refreshToken: refresh });
    expect(refreshAfter.status).toBe(401);
  });

  it('change-password: eski tokenlarni bekor qiladi va yangi parol ishlaydi', async () => {
    const login = await loginViaApi('flow-user@e2e.test', 'secret123');
    const token = login.body.data.accessToken as string;

    const missingOld = await api()
      .put('/api/auth/change-password')
      .set('Authorization', auth(token))
      .send({ newPassword: 'newsecret456' });
    expect(missingOld.status).toBe(400);

    const change = await api()
      .put('/api/auth/change-password')
      .set('Authorization', auth(token))
      .send({ oldPassword: 'secret123', newPassword: 'newsecret456' });
    expect(change.status).toBe(200);

    // Eski token bekor bo'ldi
    const oldToken = await api().get('/api/auth/me').set('Authorization', auth(token));
    expect(oldToken.status).toBe(401);

    // Eski parol ishlamaydi, yangisi ishlaydi
    const oldPass = await loginViaApi('flow-user@e2e.test', 'secret123');
    expect(oldPass.status).toBe(400);
    const newPass = await loginViaApi('flow-user@e2e.test', 'newsecret456');
    expect(newPass.status).toBe(200);
  });

  it('security events: login/logout voqealari yoziladi va faqat o\'z voqealari ko\'rinadi', async () => {
    const login = await loginViaApi('flow-user@e2e.test', 'newsecret456');
    const token = login.body.data.accessToken as string;
    await api().post('/api/auth/logout').set('Authorization', auth(token));

    const login2 = await loginViaApi('flow-user@e2e.test', 'newsecret456');
    const token2 = login2.body.data.accessToken as string;
    const events = await api().get('/api/auth/security/events').set('Authorization', auth(token2));
    expect(events.status).toBe(200);
    const types = (events.body.data as any[]).map((e) => e.type);
    expect(types).toContain('LOGIN_SUCCESS');
    expect(types).toContain('LOGOUT');

    // Boshqa user voqealarni ko'rmaydi
    const other = await registerViaApi('other-events@e2e.test', 'secret123', 'Other User', {});
    const otherToken = other.body.data.accessToken as string;
    const otherEvents = await api().get('/api/auth/security/events').set('Authorization', auth(otherToken));
    const otherTypes = (otherEvents.body.data as any[]).map((e) => e.type);
    expect(otherTypes).not.toContain('LOGOUT');
    void nextIp;
  });
});
