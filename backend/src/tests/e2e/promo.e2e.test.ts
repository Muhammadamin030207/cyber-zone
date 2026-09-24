import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb as reset, createUserDirect, createRoomFixture, nextIp, prisma } from './helpers';

function auth(token: string) {
  return `Bearer ${token}`;
}

async function login(email: string, password: string) {
  const res = await api().post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password });
  return res.body.data.accessToken;
}

describe('E2E: Promo-kod — min 100k, single-use per identity, censellikda qaytarish', () => {
  let room: any;
  let zone: any;
  let adminToken: string;
  let userAToken: string;
  let userBToken: string;
  let userAId: string;

  const DEFAULT_MIN = 100000;

  beforeAll(async () => {
    await reset();

    const admin = await createUserDirect({ email: 'promo-admin@e2e.test', password: 'secret123', role: 'SUPER_ADMIN' });
    adminToken = await login('promo-admin@e2e.test', 'secret123');

    // USER A
    await api().post('/api/auth/register').set('X-Forwarded-For', nextIp()).send({ email: 'promo-a@e2e.test', password: 'secret123', fullName: 'Promo A' });
    userAToken = await login('promo-a@e2e.test', 'secret123');
    userAId = (await prisma.user.findUnique({ where: { email: 'promo-a@e2e.test' } }))!.id;

    // USER B — A bilan AYNAN bir xil telefon raqami (identity dedup testi uchun)
    await api().post('/api/auth/register').set('X-Forwarded-For', nextIp()).send({ email: 'promo-b@e2e.test', password: 'secret123', fullName: 'Promo B' });
    userBToken = await login('promo-b@e2e.test', 'secret123');
    await prisma.user.updateMany({ where: { email: 'promo-b@e2e.test' }, data: { phone: '+998901112233' } });
    await prisma.user.update({ where: { id: userAId }, data: { phone: '+998901112233' } });

    const fixture = await createRoomFixture(admin!.id);
    room = fixture.room;
    zone = fixture.zone;
    await prisma.computer.create({
      data: { zoneId: zone.id, name: 'PC-1', status: 'AVAILABLE', specs: {} },
    });
  });

  async function makeBooking(token: string, { hours = 5, promo = 'PROMO100', key, start = '09:00' }: { hours?: number; promo?: string; key: string; start?: string }) {
    return api()
      .post('/api/bookings')
      .set('Authorization', auth(token))
      .send({
        roomId: room.id,
        zoneId: zone.id,
        date: '2026-12-15',
        startTime: start,
        durationHours: hours,
        promoCode: promo || undefined,
        idempotencyKey: key,
      });
  }

  it('yaratish: minBookingAmount berilmasa 100 000, pastroq bo\'lsa 100 000 ga oshiriladi', async () => {
    const defaulted = await api().post('/api/promo').set('Authorization', auth(adminToken)).send({
      code: 'PROMO100', discountType: 'FIXED', discountValue: 10000, expiresAt: '2099-01-01',
    });
    expect(defaulted.status).toBe(201);
    expect(Number(defaulted.body.data.minBookingAmount)).toBe(DEFAULT_MIN);

    const clamped = await api().post('/api/promo').set('Authorization', auth(adminToken)).send({
      code: 'PROMO5K', discountType: 'PERCENTAGE', discountValue: 10, minBookingAmount: 5000, expiresAt: '2099-01-01',
    });
    expect(clamped.status).toBe(201);
    expect(Number(clamped.body.data.minBookingAmount)).toBe(DEFAULT_MIN);
  });

  it('< 100 000 so\'m bron promo qabul qilmaydi (MIN_AMOUNT_NOT_REACHED)', async () => {
    // 1 soat × 20 000 = 20 000 < 100 000
    const res = await makeBooking(userAToken, { hours: 1, key: 'promo-min-1' });
    expect(res.status).toBe(400);
    // Task talabi: aniq xabar (100 000 so'm)
    expect((res.body.message || '') as string).toContain('minimal to\u2019lov');
    expect((res.body.message || '') as string).toContain('100 000');
  });

  it('>= 100 000 bron promo bilan yaratiladi; ikkinchi faol bron RAD etiladi', async () => {
    const ok = await makeBooking(userAToken, { hours: 5, key: 'promo-use-1' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.promoCodeId).toBeTruthy();
    const found = await prisma.promoCode.findUnique({ where: { code: 'PROMO100' } });
    expect(found!.usedCount).toBe(1);

    // Boshqa vaqtda ikkinchi urinish — single-use per user
    const again = await makeBooking(userAToken, { hours: 5, key: 'promo-use-2', start: '10:00' });
    expect(again.status).toBe(400);
    expect((again.body.message || '') as string).toContain('allaqachon ishlatgansiz');
  });

  it('identity: AYNAN bir xil telefon raqamli boshqa user ham promo\'ni ishlata olmaydi', async () => {
    const res = await makeBooking(userBToken, { hours: 5, key: 'promo-twin-1', start: '11:00' });
    expect(res.status).toBe(400);
    expect((res.body.message || '') as string).toContain('allaqachon ishlatgansiz');
  });

  it('bron bekor qilingach promo qayta ishlatilishi mumkin', async () => {
    const myBookings = await api().get('/api/bookings').set('Authorization', auth(userAToken));
    const booking = (myBookings.body.data as any[]).find((b) => b.promoCodeId);
    expect(booking).toBeTruthy();

    const cancel = await api().put(`/api/bookings/${booking.id}/cancel`).set('Authorization', auth(userAToken));
    expect(cancel.status).toBe(200);

    const reuse = await makeBooking(userAToken, { hours: 5, key: 'promo-use-3', start: '14:00' });
    expect(reuse.status).toBe(201);
    expect(reuse.body.data.promoCodeId).toBeTruthy();
    const found = await prisma.promoCode.findUnique({ where: { code: 'PROMO100' } });
    expect(found!.usedCount).toBe(1);
  });

  it('PROMO_INVALID_REJECTED: mavjud bo\'lmagan kod rad etiladi', async () => {
    const res = await makeBooking(userAToken, { hours: 5, key: 'promo-invalid-1', promo: 'DOESNOTEXIST', start: '09:00' });
    expect(res.status).toBe(400);
    expect((res.body.message || '') as string).toContain('topilmadi');
  });

  it('PROMO_INACTIVE_REJECTED: nofaol promo-kod rad etiladi', async () => {
    const created = await api().post('/api/promo').set('Authorization', auth(adminToken)).send({
      code: 'PROMO_OFF', discountType: 'FIXED', discountValue: 10000, expiresAt: '2099-01-01',
    });
    expect(created.status).toBe(201);
    const off = await api().patch(`/api/promo/${created.body.data.id}`).set('Authorization', auth(adminToken)).send({ isActive: false });
    expect(off.status).toBe(200);

    const res = await makeBooking(userAToken, { hours: 5, key: 'promo-inactive-1', promo: 'PROMO_OFF', start: '09:00' });
    expect(res.status).toBe(400);
    expect((res.body.message || '') as string).toContain('nofaol');
  });

  it('PROMO_EXPIRED_REJECTED: muddati tugagan promo-kod rad etiladi', async () => {
    const created = await api().post('/api/promo').set('Authorization', auth(adminToken)).send({
      code: 'PROMO_EXP', discountType: 'PERCENTAGE', discountValue: 10, expiresAt: '2020-01-01',
    });
    expect(created.status).toBe(201);

    const res = await makeBooking(userAToken, { hours: 5, key: 'promo-expired-1', promo: 'PROMO_EXP', start: '09:00' });
    expect(res.status).toBe(400);
    expect((res.body.message || '') as string).toContain('muddat');
  });

  it('PROMO_ANOTHER_ELIGIBLE_ACCOUNT: boshqa (boshqa telefonli) akkaunt promo\'ni ishlata oladi', async () => {
    // userA ning faol promoli bronini bekor qilamiz — slot (09:00-14:00) bo'shashsin
    const my = await api().get('/api/bookings').set('Authorization', auth(userAToken));
    const activeA = (my.body.data as any[]).find((b) => b.promoCodeId && b.status !== 'CANCELLED');
    if (activeA) {
      const cancelA = await api().put(`/api/bookings/${activeA.id}/cancel`).set('Authorization', auth(userAToken));
      expect(cancelA.status).toBe(200);
    }
    const afterCancel = await prisma.promoCode.findUnique({ where: { code: 'PROMO100' } });
    expect(afterCancel!.usedCount).toBe(0);

    await api().post('/api/auth/register').set('X-Forwarded-For', nextIp()).send({ email: 'promo-c@e2e.test', password: 'secret123', fullName: 'Promo C' });
    const userCToken = await login('promo-c@e2e.test', 'secret123');

    // C — farqli shaxs (telefon yo'q) — PROMO100 ni ishlata oladi (100 000 so'm)
    const res = await makeBooking(userCToken, { hours: 5, key: 'promo-c-1', start: '09:00' });
    expect(res.status).toBe(201);
    expect(res.body.data.promoCodeId).toBeTruthy();

    // Tozalash: C bronni bekor qiladi (keyingi race testiga slot bo'sh qolsin)
    const cBooking = res.body.data;
    const cancel = await api().put(`/api/bookings/${cBooking.id}/cancel`).set('Authorization', auth(userCToken));
    expect(cancel.status).toBe(200);
  });

  it('PROMO_RACE_SINGLE_USE: ikki parallel so\'rovdan FAQAT bittasi muvaffaqiyatli', async () => {
    await api().post('/api/auth/register').set('X-Forwarded-For', nextIp()).send({ email: 'promo-d@e2e.test', password: 'secret123', fullName: 'Promo D' });
    const userDToken = await login('promo-d@e2e.test', 'secret123');

    // Ikkala so'rov bir vaqtda (turli slotlar — masala faqat promo single-use)
    const [r1, r2] = await Promise.all([
      makeBooking(userDToken, { hours: 5, key: 'promo-race-1', start: '09:00' }),
      makeBooking(userDToken, { hours: 5, key: 'promo-race-2', start: '10:00' }),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(400);

    const loser = r1.status === 201 ? r2 : r1;
    expect(loser.status).toBe(400);
    expect((loser.body.message || '') as string).toContain('allaqachon ishlatgansiz');

    // DB darajasida: userD uchun faqat 1 ta PromoRedemption qatori mavjud
    const userD = (await prisma.user.findUnique({ where: { email: 'promo-d@e2e.test' } }))!;
    const redemptions = await prisma.promoRedemption.findMany({ where: { userId: userD.id } });
    expect(redemptions.length).toBe(1);
    const activeBookings = await prisma.booking.count({ where: { userId: userD.id, promoCodeId: { not: null }, status: { not: 'CANCELLED' } } });
    expect(activeBookings).toBe(1);
  });
});