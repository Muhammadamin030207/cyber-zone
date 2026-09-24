import { describe, it, expect, beforeAll } from 'vitest';
import { createHash, createHmac } from 'crypto';
import { api, resetDb, auth, loginViaApi, createUserDirect, createRoomFixture, createBookingFixture, prisma } from './helpers';

function paymeAuth() {
  const creds = Buffer.from('e2e_payme_merchant:e2e_payme_key').toString('base64');
  return `Basic ${creds}`;
}

function paynetAuth() {
  const creds = Buffer.from('e2e_paynet_merchant:e2e_paynet_secret').toString('base64');
  return `Basic ${creds}`;
}

// Uzum X-Sign = HMAC-SHA256(apiKey, EXACT raw body baytlari).
function uzumBody(orderId: string, amountSom: number) {
  return JSON.stringify({
    orderNumber: orderId,
    orderId,
    operationState: 'SUCCESS',
    amount: Math.round(amountSom * 100), // tiyin
  });
}

function uzumSign(secret: string, rawBody: string) {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

// Click callback imzosi. Sandbox SMda SANDBOX_CLICK kredensiallari ishlatiladi.
const CLICK_SANDBOX = { serviceId: 'dev-click-service', secretKey: 'dev-click-secret' };

function clickSign(params: { clickTransId: string; serviceId: string; secretKey: string; merchantTransId: string; amount: number; action: number; signTime: string }) {
  return createHash('md5')
    .update([params.clickTransId, params.serviceId, params.secretKey, params.merchantTransId, String(params.amount), String(params.action), params.signTime].join(''))
    .digest('hex');
}

function clickWebhookParams({ action, merchantTransId, clickTransId, clickPaydocId, amount, serviceId }: {
  action: number;
  merchantTransId: string;
  clickTransId?: string;
  clickPaydocId?: string;
  amount: number;
  serviceId?: string;
}) {
  const sid = serviceId || CLICK_SANDBOX.serviceId;
  const signTime = String(Date.now());
  return {
    action: String(action),
    click_trans_id: clickTransId || '',
    service_id: serviceId || '',
    click_paydoc_id: clickPaydocId || '',
    merchant_trans_id: merchantTransId,
    amount: String(amount),
    sign_time: signTime,
    sign_string: clickTransId ? clickSign({ clickTransId, serviceId: sid, secretKey: CLICK_SANDBOX.secretKey, merchantTransId, amount, action, signTime }) : '',
  };
}

function performBody(orderId: string, amountSom: number, txnId = 'txn-1') {
  return {
    method: 'PerformTransaction',
    params: { id: txnId, time: Date.now(), amount: Math.round(amountSom * 100), account: { order_id: orderId } },
  };
}

describe('E2E: Payments — ownership, amount validation, duplicate protection, webhook', () => {
  let userAId = '';
  let tokenA = '';
  let tokenB = '';
  let roomId = '';
  let zoneId = '';

  beforeAll(async () => {
    await resetDb();
    const a = await createUserDirect({ email: 'pay-a@e2e.test', password: 'pass-a-123' });
    await createUserDirect({ email: 'pay-b@e2e.test', password: 'pass-b-123' });
    userAId = a.id;
    tokenA = (await loginViaApi('pay-a@e2e.test', 'pass-a-123')).body.data.accessToken;
    tokenB = (await loginViaApi('pay-b@e2e.test', 'pass-b-123')).body.data.accessToken;
    const { room, zone } = await createRoomFixture(userAId);
    roomId = room.id;
    zoneId = zone.id;
  });

  it('providers: faqat to\'liq ulangan va sozlangan provayderlar mavjud', async () => {
    const res = await api().get('/api/payments/providers');
    expect(res.status).toBe(200);
    const providers = res.body.data.providers as any[];
    const payme = providers.find((p) => p.method === 'PAYME');
    expect(payme.available).toBe(true);
  });

  it('OWNERSHIP: B foydalanuvchi A ning broniga to\'lov yarata olmaydi (403)', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    const res = await api().post('/api/payments/create').set('Authorization', auth(tokenB)).send({ bookingId: booking.id, method: 'cash' });
    expect(res.status).toBe(403);
  });

  it('CASH: summa SERVER tomonda hisoblanadi, client "amount" e\'tiborsiz qoldiriladi', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    const res = await api()
      .post('/api/payments/create')
      .set('Authorization', auth(tokenA))
      .send({ bookingId: booking.id, method: 'cash', amount: 1, depositPercent: 30 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.payment.amount)).toBe(30000);
    expect(res.body.data.amount).toBe(30000);

    const dbPay = await prisma.payment.findUnique({ where: { id: res.body.data.payment.id } });
    expect(Number(dbPay!.amount)).toBe(30000);
  });

  it('AMOUNT VALIDATION: depositPercent chegaradan tashqari -> 400', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    const low = await api().post('/api/payments/create').set('Authorization', auth(tokenA)).send({ bookingId: booking.id, method: 'cash', depositPercent: 0 });
    expect(low.status).toBe(400);
    const high = await api().post('/api/payments/create').set('Authorization', auth(tokenA)).send({ bookingId: booking.id, method: 'cash', depositPercent: 101 });
    expect(high.status).toBe(400);
  });

  it('DUPLICATE PROTECTION: aktiv onlayn sessiya qayta yaratilmaydi (resume)', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    const active = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        userId: userAId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'PAYME',
        provider: 'PAYME',
        status: 'REDIRECT_REQUIRED',
        depositPercent: 30,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const res = await api().post('/api/payments/create').set('Authorization', auth(tokenA)).send({ bookingId: booking.id, method: 'payme' });
    expect(res.status).toBe(201);
    expect(res.body.data.resumed).toBe(true);
    expect(res.body.data.payment.id).toBe(active.id);

    const count = await prisma.payment.count({ where: { bookingId: booking.id } });
    expect(count).toBe(1);
  });

  it('WEBHOOK: imzosiz/soxta webhook to\'lovni PAID qila olmaydi', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: {
        id: 'pay-w-1',
        bookingId: booking.id,
        userId: userAId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'PAYME',
        provider: 'PAYME',
        status: 'PROCESSING',
        depositPercent: 30,
        providerTransactionId: 'pay-w-1',
      },
    });

    const res = await api().post('/api/payments/webhook/payme').send(performBody('pay-w-1', 30000));
    expect(res.status).toBe(200);
    expect(res.body.error).toBeTruthy();

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-w-1' } });
    expect(pay!.status).toBe('PROCESSING');
  });

  it('WEBHOOK: summa mos kelmasa PAID qilinmaydi', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: {
        id: 'pay-w-2',
        bookingId: booking.id,
        userId: userAId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'PAYME',
        provider: 'PAYME',
        status: 'PROCESSING',
        depositPercent: 30,
        providerTransactionId: 'pay-w-2',
      },
    });

    const res = await api().post('/api/payments/webhook/payme').set('Authorization', paymeAuth()).send(performBody('pay-w-2', 35000));
    expect(res.status).toBe(200);

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-w-2' } });
    expect(pay!.status).toBe('PROCESSING');
  });

  it('CLICK WEBHOOK: Prepare (action=0) -> PROCESSING, no fake PAID on prepare', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: {
        id: 'pay-clk-1',
        bookingId: booking.id,
        userId: userAId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'CLICK',
        provider: 'CLICK',
        status: 'PROCESSING',
        depositPercent: 30,
        providerTransactionId: 'pay-clk-1',
      },
    });

    const res = await api()
      .post('/api/payments/webhook/click')
      .query(
        clickWebhookParams({
          action: 0,
          merchantTransId: 'pay-clk-1',
          clickTransId: 'ct-1',
          clickPaydocId: 'pd-1',
          amount: 30000,
          serviceId: '',
        })
      );
    expect(res.status).toBe(200);

    // Prepare hech qachon PAID qilmaydi — holat PROCESSING da qoladi.
    const pay = await prisma.payment.findUnique({ where: { id: 'pay-clk-1' } });
    expect(pay!.status).toBe('PROCESSING');
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b!.status).toBe('PENDING');
  });

  it('CLICK WEBHOOK: Complete (action=1) -> PAID, bron PARTIALLY_PAID', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: {
        id: 'pay-clk-2',
        bookingId: booking.id,
        userId: userAId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'CLICK',
        provider: 'CLICK',
        status: 'PROCESSING',
        depositPercent: 30,
        providerTransactionId: 'pay-clk-2',
      },
    });

    const res = await api()
      .post('/api/payments/webhook/click')
      .query(clickWebhookParams({ action: 1, merchantTransId: 'pay-clk-2', clickTransId: 'ct-2', clickPaydocId: 'pd-2', amount: 30000 }));
    expect(res.status).toBe(200);
    expect(res.body.error).toBe(0);

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-clk-2' } });
    expect(pay!.status).toBe('PAID');
    expect(pay!.paidAt).not.toBeNull();
    expect(pay!.providerPaymentId).toBe('pd-2');

    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b!.status).toBe('PARTIALLY_PAID');
  });

  it('CLICK WEBHOOK: summa mos kelmasa PAID qilinmaydi (idempotent)', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: {
        id: 'pay-clk-3',
        bookingId: booking.id,
        userId: userAId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'CLICK',
        provider: 'CLICK',
        status: 'PROCESSING',
        depositPercent: 30,
        providerTransactionId: 'pay-clk-3',
      },
    });

    const res = await api()
      .post('/api/payments/webhook/click')
      .query(clickWebhookParams({ action: 1, merchantTransId: 'pay-clk-3', clickTransId: 'ct-3', clickPaydocId: 'pd-3', amount: 35000 }));
    expect(res.status).toBe(200);

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-clk-3' } });
    expect(pay!.status).toBe('PROCESSING');
  });

  it('WEBHOOK: to\'g\'ri imzo + summa -> PAID, bron PARTIALLY_PAID, idempotent', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: {
        id: 'pay-w-3',
        bookingId: booking.id,
        userId: userAId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'PAYME',
        provider: 'PAYME',
        status: 'PROCESSING',
        depositPercent: 30,
        providerTransactionId: 'pay-w-3',
      },
    });

    const res = await api().post('/api/payments/webhook/payme').set('Authorization', paymeAuth()).send(performBody('pay-w-3', 30000));
    expect(res.status).toBe(200);

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-w-3' } });
    expect(pay!.status).toBe('PAID');
    expect(pay!.paidAt).not.toBeNull();

    const updatedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(updatedBooking!.status).toBe('PARTIALLY_PAID');

    const points1 = await prisma.loyaltyTransaction.count({ where: { bookingId: booking.id } });
    expect(points1).toBeGreaterThan(0);
    const paidAt = pay!.paidAt!.getTime();

    // Idempotent replay
    const replay = await api().post('/api/payments/webhook/payme').set('Authorization', paymeAuth()).send(performBody('pay-w-3', 30000));
    expect(replay.status).toBe(200);

    const pay2 = await prisma.payment.findUnique({ where: { id: 'pay-w-3' } });
    expect(pay2!.status).toBe('PAID');
    expect(pay2!.paidAt!.getTime()).toBe(paidAt);
    const points2 = await prisma.loyaltyTransaction.count({ where: { bookingId: booking.id } });
    expect(points2).toBe(points1);
  });

  it('CASH confirm: oddiy USER tasdiqlay olmaydi (faqat ADMIN)', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    const create = await api().post('/api/payments/create').set('Authorization', auth(tokenA)).send({ bookingId: booking.id, method: 'cash' });
    const payId = create.body.data.payment.id;
    const res = await api().post(`/api/payments/${payId}/confirm`).set('Authorization', auth(tokenA));
    expect(res.status).toBe(403);
  });

  it('UZUM WEBHOOK: imzosiz/soxta X-Sign rad etiladi — PAID qilinmaydi', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: { id: 'pay-uz-deny', bookingId: booking.id, userId: userAId, amount: 30000, type: 'ADVANCE', method: 'UZUM', provider: 'UZUM', status: 'PROCESSING', depositPercent: 30, providerTransactionId: 'pay-uz-deny' },
    });

    const body = uzumBody('pay-uz-deny', 30000);
    const noSign = await api().post('/api/payments/webhook/uzum').set('Content-Type', 'application/json').set('X-Terminal-Id', 'e2e_uzum_terminal').send(body);
    expect(noSign.status).toBe(200);
    expect(noSign.body.errorCode).toBe(-1);

    const badSign = await api()
      .post('/api/payments/webhook/uzum')
      .set('Content-Type', 'application/json')
      .set('X-Terminal-Id', 'e2e_uzum_terminal')
      .set('X-Sign', 'deadbeef')
      .send(body);
    expect(badSign.status).toBe(200);
    expect(badSign.body.errorCode).toBe(-1);

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-uz-deny' } });
    expect(pay!.status).toBe('PROCESSING');
  });

  it('UZUM WEBHOOK: to\'g\'ri raw-body HMAC + summa -> PAID, idempotent', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: { id: 'pay-uz-ok', bookingId: booking.id, userId: userAId, amount: 30000, type: 'ADVANCE', method: 'UZUM', provider: 'UZUM', status: 'PROCESSING', depositPercent: 30, providerTransactionId: 'pay-uz-ok' },
    });

    const body = uzumBody('pay-uz-ok', 30000);
    const sign = uzumSign('e2e_uzum_secret', body);
    const res = await api().post('/api/payments/webhook/uzum').set('Content-Type', 'application/json').set('X-Terminal-Id', 'e2e_uzum_terminal').set('X-Sign', sign).send(body);
    expect(res.status).toBe(200);
    expect(res.body.errorCode).toBe(0);

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-uz-ok' } });
    expect(pay!.status).toBe('PAID');

    const booking2 = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(booking2!.status).toBe('PARTIALLY_PAID');

    // Idempotent replay
    const replay = await api().post('/api/payments/webhook/uzum').set('Content-Type', 'application/json').set('X-Terminal-Id', 'e2e_uzum_terminal').set('X-Sign', sign).send(body);
    expect(replay.status).toBe(200);
    expect((await prisma.payment.findUnique({ where: { id: 'pay-uz-ok' } }))!.status).toBe('PAID');
  });

  it('UZUM WEBHOOK: summa mos kelmasa PAID qilinmaydi', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: { id: 'pay-uz-amt', bookingId: booking.id, userId: userAId, amount: 30000, type: 'ADVANCE', method: 'UZUM', provider: 'UZUM', status: 'PROCESSING', depositPercent: 30, providerTransactionId: 'pay-uz-amt' },
    });

    const body = uzumBody('pay-uz-amt', 35000);
    const res = await api().post('/api/payments/webhook/uzum').set('Content-Type', 'application/json').set('X-Terminal-Id', 'e2e_uzum_terminal').set('X-Sign', uzumSign('e2e_uzum_secret', body)).send(body);
    expect(res.status).toBe(200);
    expect((await prisma.payment.findUnique({ where: { id: 'pay-uz-amt' } }))!.status).toBe('PROCESSING');
  });

  it('PAYNET WEBHOOK: authsiz/noto\'g\'ri Basic rad etiladi', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: { id: 'pay-pn-deny', bookingId: booking.id, userId: userAId, amount: 30000, type: 'ADVANCE', method: 'PAYNET', provider: 'PAYNET', status: 'PROCESSING', depositPercent: 30, providerTransactionId: 'pay-pn-deny' },
    });

    const body = { jsonrpc: '2.0', id: 1, method: 'PerformTransaction', params: { account: 'pay-pn-deny', amount: 3000000, fields: { id: 'pay-pn-deny' } } };
    const res = await api().post('/api/payments/webhook/paynet').send(body);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeTruthy();
    expect((await prisma.payment.findUnique({ where: { id: 'pay-pn-deny' } }))!.status).toBe('PROCESSING');
  });

  it('PAYNET WEBHOOK: JSON-RPC PerformTransaction Basic auth bilan -> PAID', async () => {
    const booking = await createBookingFixture(userAId, roomId, zoneId, 100000);
    await prisma.payment.create({
      data: { id: 'pay-pn-ok', bookingId: booking.id, userId: userAId, amount: 30000, type: 'ADVANCE', method: 'PAYNET', provider: 'PAYNET', status: 'PROCESSING', depositPercent: 30, providerTransactionId: 'pay-pn-ok' },
    });

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'PerformTransaction',
      params: { transactionId: 'pn-txn-1', account: 'pay-pn-ok', amount: 3000000, fields: { id: 'pay-pn-ok' } },
    };
    const res = await api().post('/api/payments/webhook/paynet').set('Authorization', paynetAuth()).send(body);
    expect(res.status).toBe(200);
    expect(res.body.result?.status).toBe('OK');

    const pay = await prisma.payment.findUnique({ where: { id: 'pay-pn-ok' } });
    expect(pay!.status).toBe('PAID');
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))!.status).toBe('PARTIALLY_PAID');
  });
});
