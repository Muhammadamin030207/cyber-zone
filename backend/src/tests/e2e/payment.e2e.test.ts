import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, loginViaApi, createUserDirect, createRoomFixture, createBookingFixture, prisma } from './helpers';

function paymeAuth() {
  const creds = Buffer.from('e2e_payme_merchant:e2e_payme_key').toString('base64');
  return `Basic ${creds}`;
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
});
