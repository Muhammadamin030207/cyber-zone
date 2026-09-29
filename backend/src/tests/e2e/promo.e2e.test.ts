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
    expect((again.body.message || '') as string).toContain('limiti tugagan');
  });

  it('identity: AYNAN bir xil telefon raqamli boshqa user ham promo\'ni ishlata olmaydi', async () => {
    const res = await makeBooking(userBToken, { hours: 5, key: 'promo-twin-1', start: '11:00' });
    expect(res.status).toBe(400);
    expect((res.body.message || '') as string).toContain('limiti tugagan');
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
    expect((loser.body.message || '') as string).toContain('limiti tugagan');

    // DB darajasida: userD uchun faqat 1 ta PromoRedemption qatori mavjud
    const userD = (await prisma.user.findUnique({ where: { email: 'promo-d@e2e.test' } }))!;
    const redemptions = await prisma.promoRedemption.findMany({ where: { userId: userD.id } });
    expect(redemptions.length).toBe(1);
    const activeBookings = await prisma.booking.count({ where: { userId: userD.id, promoCodeId: { not: null }, status: { not: 'CANCELLED' } } });
    expect(activeBookings).toBe(1);
  });
});
// ============ Admin ro'yxatida muddati o'tgan promo-kod KO'RINMAYDI ============
describe('E2E: Promo-kod — admin ro\'yxatida muddati o\'tgan kod yashiriladi', () => {
  let superAdminToken: string;
  let superAdminId: string;
  let roomId: string;

  beforeAll(async () => {
    await reset();
    const superAdmin = await createUserDirect({ email: 'promo-exp-admin@e2e.test', password: 'secret123', role: 'SUPER_ADMIN' });
    superAdminId = superAdmin.id;
    superAdminToken = await login('promo-exp-admin@e2e.test', 'secret123');
    const fixture = await createRoomFixture(superAdmin.id);
    roomId = fixture.room.id;
  });

  async function makePromo(code: string, expiresAt: Date, extra: Record<string, unknown> = {}) {
    return prisma.promoCode.create({
      data: {
        code,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        usageScope: 'MULTI_USE',
        createdBy: superAdminId,
        startsAt: new Date(Date.now() - 86_400_000),
        expiresAt,
        roomId,
        ...extra,
      } as any,
    });
  }

  it('muddati o\'tgan kod default ro\'yxatda KO\'RINMAYDI', async () => {
    await makePromo('MUDDATIOTGAN', new Date(Date.now() - 1000));

    const res = await api().get('/api/promo').set('Authorization', auth(superAdminToken));
    expect(res.status).toBe(200);
    const codes = res.body.data.map((p: any) => p.code);
    expect(codes).not.toContain('MUDDATIOTGAN');
  });

  it('hali amal qiluvchi kod KO\'RINADI va status=ACTIVE', async () => {
    await makePromo('YASHIROQ', new Date(Date.now() + 86_400_000));

    const res = await api().get('/api/promo').set('Authorization', auth(superAdminToken));
    const found = res.body.data.find((p: any) => p.code === 'YASHIROQ');
    expect(found).toBeTruthy();
    expect(found.status).toBe('ACTIVE');
    expect(found.expiresInMinutes).toBeGreaterThan(0);
    // Decimal JSON muammosi yo'q — oddiy son qaytadi
    expect(typeof found.discountValue).toBe('number');
  });

  it('include_expired=1 bilan o\'tgan kodlar TEKSHIRUV uchun ko\'rinadi (status=EXPIRED)', async () => {
    const res = await api()
      .get('/api/promo?include_expired=1')
      .set('Authorization', auth(superAdminToken));
    const found = res.body.data.find((p: any) => p.code === 'MUDDATIOTGAN');
    expect(found).toBeTruthy();
    expect(found.status).toBe('EXPIRED');
    expect(found.expiresInMinutes).toBe(0);
  });

  it('hali boshlanmagan kod -> status=NOT_STARTED (va ko\'rinadi)', async () => {
    await makePromo('KELGUSI', new Date(Date.now() + 7 * 86_400_000), {
      startsAt: new Date(Date.now() + 3 * 86_400_000),
    });
    const res = await api().get('/api/promo').set('Authorization', auth(superAdminToken));
    const found = res.body.data.find((p: any) => p.code === 'KELGUSI');
    expect(found).toBeTruthy();
    expect(found.status).toBe('NOT_STARTED');
  });

  it('muddati o\'tgan kod ishlatingicha BO\'LMAYDI (double-check)', async () => {
    const res = await api().get('/api/promo/check?code=MUDDATIOTGAN');
    expect(res.body.success).not.toBe(true);
  });
});

/**
 * `GET /api/promo/check` — frontend shu endpoint orqali "promo kiritdimi?"
 * degan savolga javob oladi. Ikki talab bor:
 *   1) KIRISHISIZ ham ishlashi kerak (login sahifasidan kirish mumkin)
 *   2) TOKEN bo'lsa shaxsiy limit ham tekshirilishi kerak — aks holda
 *      foydalanuvchi "yaroqli" ko'rib, keyin booking paytida "limit
 *      tugagan" xatosini oladi (chalkash hisob-kitob).
 */
describe('E2E: GET /api/promo/check — kirishsiz va shaxsiy limit', () => {
  let room: any;
  let zone: any;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    await reset();
    const admin = await createUserDirect({ email: 'check-admin@e2e.test', password: 'secret123', role: 'SUPER_ADMIN' });
    adminToken = await login('check-admin@e2e.test', 'secret123');
    const fixture = await createRoomFixture(admin!.id);
    room = fixture.room;
    zone = fixture.zone;
    await prisma.computer.create({ data: { zoneId: zone.id, name: 'PC-CHK', status: 'AVAILABLE', specs: {} } });

    await api().post('/api/auth/register').set('X-Forwarded-For', nextIp()).send({ email: 'check-user@e2e.test', password: 'secret123', fullName: 'Check User' });
    userToken = await login('check-user@e2e.test', 'secret123');

    await api().post('/api/promo').set('Authorization', auth(adminToken)).send({
      code: 'CHECK10', discountType: 'PERCENTAGE', discountValue: 10, minBookingAmount: 100000, expiresAt: '2099-01-01',
    });
  });

  async function bookWithPromo(key: string) {
    return api()
      .post('/api/bookings')
      .set('Authorization', auth(userToken))
      .send({
        roomId: room.id, zoneId: zone.id, date: '2026-12-15',
        startTime: '09:00', durationHours: 5, promoCode: 'CHECK10', idempotencyKey: key,
      });
  }

  it('kirishsiz chaqirish ishlaydi (401 emas) va limit tekshirilmaganini aytadi', async () => {
    const res = await api().get('/api/promo/check?code=CHECK10');
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('CHECK10');
    // Kirishsiz: shaxsiy limit tekshirilmagan — frontend buni yashirishi mumkin
    expect(res.body.data.personalLimitChecked).toBe(false);
  });

  it('token bilan chaqirilganda shaxsiy limit TEKSHIRILADI', async () => {
    const res = await api().get('/api/promo/check?code=CHECK10').set('Authorization', auth(userToken));
    expect(res.status).toBe(200);
    expect(res.body.data.personalLimitChecked).toBe(true);
  });

  it('limit tugagach /check ham rad etadi — booking paytidagi xatoga tegishli emas', async () => {
    const booked = await bookWithPromo('check-1');
    expect(booked.status).toBe(201);

    // Mijoz endi kodni qayta kiritsa — "yaroqli" emas, aniq "limit tugagan"
    const res = await api().get('/api/promo/check?code=CHECK10').set('Authorization', auth(userToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROMO_USER_LIMIT');
    expect(res.body.message).toContain('limiti tugagan');

    // Booking ham rad etiladi (server tomonda tekshiriladi)
    const again = await bookWithPromo('check-2');
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('PROMO_USER_LIMIT');
  });

  it('noma\'lum kod -> PROMO_NOT_FOUND; nofaol kod -> PROMO_INACTIVE (chetlab o\'tmaydi)', async () => {
    const missing = await api().get('/api/promo/check?code=YOQOTILGAN');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('PROMO_NOT_FOUND');

    await api().post('/api/promo').set('Authorization', auth(adminToken)).send({
      code: 'OFFCODE', discountType: 'FIXED', discountValue: 5000, expiresAt: '2099-01-01',
    });
    // Nofaol qilish uchun ID kerak — ro'yxatdan olamiz
    const list = await api().get('/api/promo').set('Authorization', auth(adminToken));
    const offId = (list.body.data as any[]).find((p) => p.code === 'OFFCODE').id;
    const disabled = await api().patch(`/api/promo/${offId}`).set('Authorization', auth(adminToken)).send({ isActive: false });
    expect(disabled.status).toBe(200);

    const res = await api().get('/api/promo/check?code=OFFCODE').set('Authorization', auth(userToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROMO_INACTIVE');
  });
});

/**
 * Anti-abuse kafolatlari (§3). Oldingi holatda `maxUses` faqat `/api/promo/me`
 * ro'yxatida filtr qilib qo'yilgan edi — BRON yaratishda umuman tekshirilmasdi.
 * Ya'ni "100 marta" belgilangan kodni 1000 kishi ishlatishi mumkin edi.
 */
describe('E2E: promo global limit va twin-account himoyasi', () => {
  let room: any;
  let zone: any;
  let adminToken: string;

  beforeAll(async () => {
    await reset();
    const admin = await createUserDirect({ email: 'g-admin@e2e.test', password: 'secret123', role: 'SUPER_ADMIN' });
    adminToken = await login('g-admin@e2e.test', 'secret123');
    const fixture = await createRoomFixture(admin!.id);
    room = fixture.room;
    zone = fixture.zone;
    for (const n of ['G1', 'G2', 'G3']) {
      await prisma.computer.create({ data: { zoneId: zone.id, name: `PC-${n}`, status: 'AVAILABLE', specs: {} } });
    }
    // maxUses: 2 — uch xil turli akkaunt bilan urinish
    await api().post('/api/promo').set('Authorization', auth(adminToken)).send({
      code: 'GLOBAL2', discountType: 'PERCENTAGE', discountValue: 10,
      minBookingAmount: 0, maxUses: 2, expiresAt: '2099-01-01',
    });
  });

  it('maxUses BRON paytida ham server tomonda tekshiriladi (1 va 2 o\'tadi, 3 rad etiladi)', async () => {
    // Uch xil akkaunt — twin-account simulatsiyasi. Ularning hech biriga
    // telefon yo'q, shuning uchun per-user limit ulardan qochadi:
    // faqat GLOBAL limit ularni to'xtatishi mumkin.
    const tokens: string[] = [];
    for (const n of ['a', 'b', 'c']) {
      await api().post('/api/auth/register').set('X-Forwarded-For', nextIp())
        .send({ email: `g-${n}@e2e.test`, password: 'secret123', fullName: `G ${n}` });
      tokens.push(await login(`g-${n}@e2e.test`, 'secret123'));
    }

    const dates = ['2026-12-15', '2026-12-16', '2026-12-17'];
    const first = await api().post('/api/bookings').set('Authorization', auth(tokens[0])).send({
      roomId: room.id, zoneId: zone.id, date: dates[0], startTime: '09:00',
      durationHours: 5, promoCode: 'GLOBAL2', idempotencyKey: 'g-1',
    });
    expect(first.status).toBe(201);

    // Ikkinchi akkaunt: per-user limit o'ziga tegilmaydi (boshqa shaxs),
    // ammo global limit hali to'lmagan -> o'tishi kerak.
    const second = await api().post('/api/bookings').set('Authorization', auth(tokens[1])).send({
      roomId: room.id, zoneId: zone.id, date: dates[1], startTime: '09:00',
      durationHours: 5, promoCode: 'GLOBAL2', idempotencyKey: 'g-2',
    });
    expect(second.status).toBe(201);

    // Uchinchi: global chegara tugagan -> rad etilishi SHART.
    const third = await api().post('/api/bookings').set('Authorization', auth(tokens[2])).send({
      roomId: room.id, zoneId: zone.id, date: dates[2], startTime: '09:00',
      durationHours: 5, promoCode: 'GLOBAL2', idempotencyKey: 'g-3',
    });
    expect(third.status).toBe(400);
    expect(third.body.code).toBe('PROMO_GLOBAL_LIMIT');
  });
});
