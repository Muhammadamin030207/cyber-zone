import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, loginViaApi, createUserDirect, createRoomFixture, createBookingFixture, prisma } from './helpers';

describe('Payment sandbox (test) runtime', () => {
  let userId = '';
  let userIdUser = '';
  let tokenSuper: string;
  let tokenAdmin: string;
  let tokenUser: string;
  let roomId = '';
  let zoneId = '';

  beforeAll(async () => {
    await resetDb();
    const superUser = await createUserDirect({ email: 'sbx-super@e2e.test', password: 'pass-sbx-1', role: 'SUPER_ADMIN' });
    userId = superUser.id;
    await createUserDirect({ email: 'sbx-admin@e2e.test', password: 'pass-sbx-2', role: 'ADMIN' });
    const userRec = await createUserDirect({ email: 'sbx-user@e2e.test', password: 'pass-sbx-3', role: 'USER' });
    userIdUser = userRec.id;
    tokenSuper = (await loginViaApi('sbx-super@e2e.test', 'pass-sbx-1')).body.data.accessToken;
    tokenAdmin = (await loginViaApi('sbx-admin@e2e.test', 'pass-sbx-2')).body.data.accessToken;
    tokenUser = (await loginViaApi('sbx-user@e2e.test', 'pass-sbx-3')).body.data.accessToken;
    const { room, zone } = await createRoomFixture(userId);
    roomId = room.id;
    zoneId = zone.id;
  });

  it('providers: sandbox flag + barcha 4 usul test rejimida mavjud', async () => {
    const res = await api().get('/api/payments/providers');
    expect(res.status).toBe(200);
    expect(typeof res.body.data.sandbox).toBe('boolean');
    const providers = res.body.data.providers as any[];
    for (const method of ['CLICK', 'PAYME', 'UZUM', 'PAYNET']) {
      const p = providers.find((p) => p.method === method);
      expect(p, method).toBeTruthy();
      expect(p.available, method).toBe(true);
    }
  });

  it('GET admin/sandbox: SUPER_ADMIN 200, ADMIN/USER 403, authsiz 401', async () => {
    const ok = await api().get('/api/payments/admin/sandbox').set('Authorization', auth(tokenSuper));
    expect(ok.status).toBe(200);
    expect(typeof ok.body.data.enabled).toBe('boolean');

    const noAuth = await api().get('/api/payments/admin/sandbox');
    expect(noAuth.status).toBe(401);

    const asAdmin = await api().get('/api/payments/admin/sandbox').set('Authorization', auth(tokenAdmin));
    expect(asAdmin.status).toBe(403);

    const asUser = await api().get('/api/payments/admin/sandbox').set('Authorization', auth(tokenUser));
    expect(asUser.status).toBe(403);
  });

  it('PUT admin/sandbox: SUPER_ADMIN yoqib/o\'chirib saqlaydi (persist), boshqalar 403', async () => {
    const enable = await api()
      .put('/api/payments/admin/sandbox')
      .set('Authorization', auth(tokenSuper))
      .send({ enabled: true });
    expect(enable.status).toBe(200);

    const stored = await prisma.siteSetting.findUnique({ where: { key: 'payments.sandbox' } });
    expect(stored?.value).toBe('on');

    const disable = await api()
      .put('/api/payments/admin/sandbox')
      .set('Authorization', auth(tokenSuper))
      .send({ enabled: false });
    expect(disable.status).toBe(200);
    const afterOff = await prisma.siteSetting.findUnique({ where: { key: 'payments.sandbox' } });
    expect(afterOff?.value).toBe('off');

    const asUser = await api()
      .put('/api/payments/admin/sandbox')
      .set('Authorization', auth(tokenUser))
      .send({ enabled: true });
    expect(asUser.status).toBe(403);

    await api().put('/api/payments/admin/sandbox').set('Authorization', auth(tokenSuper)).send({ enabled: true });
  });

  it('E2E: Click create -> checkoutUrl host=request host, mock gateway orqali to\'lov PAID bo\'ladi', async () => {
    const booking = await createBookingFixture(userId, roomId, zoneId, 120000);
    const create = await api()
      .post('/api/payments/create')
      .set('Authorization', auth(tokenSuper))
      .send({ bookingId: booking.id, method: 'click' });
    expect(create.status).toBe(201);
    expect(create.body.data.checkoutUrl).toMatch(/\/api\/payments\/mock\/click\?/);
    expect(create.body.data.checkoutUrl).not.toContain('localhost:3000');

    const paymentId: string = create.body.data.payment.id;
    const url = new URL(create.body.data.checkoutUrl);
    const gate = await api().get(url.pathname + url.search);
    expect([200, 302]).toContain(gate.status);

    const paid = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(paid!.status).toBe('PAID');
    expect(paid!.method).toBe('CLICK');
    expect(paid!.providerTransactionId).toBeTruthy();
  });

  it('E2E: Uzum mock ham request-host asosidagi signed webhook bilan PAID qiladi', async () => {
    const booking = await createBookingFixture(userIdUser, roomId, zoneId, 150000);
    const create = await api()
      .post('/api/payments/create')
      .set('Authorization', auth(tokenUser))
      .send({ bookingId: booking.id, method: 'uzum' });
    expect(create.status).toBe(201);
    expect(create.body.data.checkoutUrl).toMatch(/\/api\/payments\/mock\/uzum\?/);
    expect(create.body.data.checkoutUrl).not.toContain('localhost:3000');

    const url = new URL(create.body.data.checkoutUrl);
    const gate = await api().get(url.pathname + url.search);
    expect([200, 302]).toContain(gate.status);

    const paid = await prisma.payment.findUnique({ where: { id: create.body.data.payment.id } });
    expect(paid!.status).toBe('PAID');
  });
});