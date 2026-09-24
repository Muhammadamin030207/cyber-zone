import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, nextIp, prisma, createUserDirect } from './helpers';

describe('E2E: Sayt bilimlari (§6.16) — admin boshqaradigan FAQ/aloqa', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('GET public: bo\'sh settings qaytadi', async () => {
    const res = await api().get('/api/settings/site');
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toBeDefined();
  });

  it('PUT faqat ADMIN/SUPER_ADMIN: USER rad etiladi', async () => {
    await createUserDirect({ email: 'settings-user@e2e.test', password: 'user-pass-123', role: 'USER' });
    const login = await api()
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'settings-user@e2e.test', password: 'user-pass-123' });
    expect(login.status).toBe(200);
    const token = login.body.data?.accessToken as string;

    const res = await api()
      .put('/api/settings/site')
      .set('Authorization', auth(token))
      .send({ value: { faq: 'Savol\nJavob' } });
    expect(res.status).toBe(403);
  });

  it('PUT ADMIN: saqlanadi, GET qaytaradi, noma\'lum kalit o\'tkazib yuboriladi', async () => {
    const admin = await createUserDirect({ email: 'settings-admin2@e2e.test', password: 'admin-pass-123', role: 'ADMIN' });
    void admin;
    const login = await api()
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'settings-admin2@e2e.test', password: 'admin-pass-123' });
    expect(login.status).toBe(200);
    const token = login.body.data?.accessToken as string;

    const put = await api()
      .put('/api/settings/site')
      .set('Authorization', auth(token))
      .send({
        value: {
          faq: 'Qanday to\'lash mumkin?\nClick yoki naqd.',
          payment_info: 'Click, PayMe va naqd pul.',
          evil_key: 'ignore me',
        },
      });
    expect(put.status).toBe(200);
    expect(put.body.data.settings.faq).toContain('Click');
    expect(put.body.data.settings.payment_info).toBe('Click, PayMe va naqd pul.');
    expect(put.body.data.settings.evil_key).toBeUndefined();

    // Public GET — barchaga ko'rinadi
    const get = await api().get('/api/settings/site');
    expect(get.status).toBe(200);
    expect(get.body.data.settings.faq).toContain('Click');

    // DB'da haqiqatan saqlangan
    const row = await prisma.siteSetting.findUnique({ where: { key: 'faq' } });
    expect(row?.value).toContain('Click');
  });

  it('PUT: inti-noma\'lum kalit yoki juda uzun qiymat rad etiladi', async () => {
    const admin = await createUserDirect({ email: 'settings-admin3@e2e.test', password: 'admin-pass-123', role: 'ADMIN' });
    void admin;
    const login = await api()
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'settings-admin3@e2e.test', password: 'admin-pass-123' });
    const token = login.body.data?.accessToken as string;

    const tooLong = await api()
      .put('/api/settings/site')
      .set('Authorization', auth(token))
      .send({ value: { contact_phone: 'x'.repeat(300) } });
    expect(tooLong.status).toBe(400);

    const nonString = await api()
      .put('/api/settings/site')
      .set('Authorization', auth(token))
      .send({ value: { faq: 42 } });
    expect(nonString.status).toBe(400);
  });
});