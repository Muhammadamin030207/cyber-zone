import { describe, it, expect, beforeAll } from 'vitest';
import {
  api, resetDb, auth, loginViaApi, createUserDirect,
  createRoomFixture, createBookingFixture, prisma, nextIp,
} from './helpers';

function png() {
  return Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
}

/**
 * QO'LDA O'TKAZMA (TRANSFER) oqimi:
 *   1) dogaon kartasi faqat authenticated ko'rinadi (ommaviy EMAS)
 *   2) to'lovchi oxirgi 4 raqam + ism + 1..3 chek yuboradi
 *   3) tasdiq PAID qilMAYDI — admin bank hisobida tekshiradi
 *   4) qarz (overtime) ro'yxati + kassada to'lash tasdig'i
 */
describe("E2E: Qo'lda o'tkazma to'lov (karta oxirgi 4 + chek) + kassa", () => {
  let superAdminToken: string;
  let userToken: string;
  let otherToken: string;
  let userId: string;
  let roomId: string;
  let bookingId: string;

  beforeAll(async () => {
    await resetDb();
    const superAdmin = await createUserDirect({ email: 'pay-super@e2e.test', password: 'secret123', fullName: 'SA', role: 'SUPER_ADMIN' });
    const user = await createUserDirect({ email: 'pay-user@e2e.test', password: 'secret123', fullName: 'User One' });
    const other = await createUserDirect({ email: 'pay-other@e2e.test', password: 'secret123', fullName: 'User Two' });

    superAdminToken = auth((await loginViaApi(superAdmin.email, 'secret123')).body.data.accessToken);
    userToken = auth((await loginViaApi(user.email, 'secret123')).body.data.accessToken);
    otherToken = auth((await loginViaApi(other.email, 'secret123')).body.data.accessToken);
    userId = user.id;

    const fixture = await createRoomFixture(superAdmin.id);
    roomId = fixture.room.id;
    const booking = await createBookingFixture(userId, roomId, fixture.zone.id);
    bookingId = booking.id;
  });

  async function makeTransferPayment(overrides: Record<string, unknown> = {}) {
    return prisma.payment.create({
      data: {
        bookingId,
        userId,
        amount: 30000,
        type: 'ADVANCE',
        method: 'TRANSFER',
        status: 'PENDING',
        currency: 'UZS',
        depositPercent: 30,
        ...overrides,
      } as any,
    });
  }

  // ---------------- Dogaon kartasi ----------------

  it('kartalar OMMAVIY settings\'da KO\'RINMAYDI (skraper himoyasi)', async () => {
    await prisma.siteSetting.upsert({
      where: { key: 'payment_card_number' },
      update: { value: '8600 1234 5678 4321' },
      create: { key: 'payment_card_number', value: '8600 1234 5678 4321' },
    });

    const res = await api().get('/api/settings/site');
    expect(res.status).toBe(200);
    expect(res.body.data.settings.payment_card_number).toBeUndefined();
  });

  it('GET /merchant-card — autentifikatsiyasiz -> 401', async () => {
    const res = await api().get('/api/payments/merchant-card');
    expect(res.status).toBe(401);
  });

  it('GET /merchant-card — authenticated foydalanuvchiga karta ko\'rinadi', async () => {
    for (const [key, value] of [['payment_card_holder', 'CYBER ZONE MChJ'], ['payment_card_bank', 'TESTBANK']] as const) {
      await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }

    const res = await api().get('/api/payments/merchant-card').set('Authorization', userToken);
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(true);
    expect(res.body.data.card.number).toBe('8600 1234 5678 4321');
    expect(res.body.data.card.holder).toBe('CYBER ZONE MChJ');
    // nusxalash uchun toza ko'rinish
    expect(res.body.data.card.numberFormatted).toBe('8600 1234 5678 4321');
  });

  // ---------------- Tasdiq (proof) ----------------

  it('tasdiq: cheksiz -> 400', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('cardLast4', '4321')
      .field('cardholderName', 'Aliyev Ali');
    expect(res.status).toBe(400);
  });

  /**
   * KONTAKT TESTI: mijoz (frontend) qanday nomlar bilan yuboradi.
   *
   * Bu test avval barcha e2e da backend'ning O'Z nomlari (`cardLast4` /
   * `cardholderName`) ishlatilardi — shuning uchun frontend bilan ziddiyat
   * sezilmasdi va oqim ishlashini yolg'on da'vo qilindi. Haqiqiy mijoz
   * `TransferPanel.tsx` dan `proofCardLast4` / `proofCardholderName` yuboradi.
   * Quyidagi test shu ANIQ kontraktni tekshiradi.
   */
  it('tasdiq: MIJOZ nomlari (proofCardLast4/proofCardholderName) -> 200', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('proofCardLast4', '4321')
      .field('proofCardholderName', 'Aliyev Ali')
      .attach('receipts', png(), { filename: 'frontend.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    const row = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(row!.proofCardLast4).toBe('4321');
    expect(row!.proofCardholderName).toBe('Aliyev Ali');
    // Tasdiq PAID qilMAYDI — admin tasdiqlashi kerak.
    expect(row!.status).toBe('PENDING');
    expect(row!.paidAt).toBeNull();
  });

  it('tasdiq: ikkala nom birga kelganda mijoz nomi ustunlik qiladi', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('proofCardLast4', '1111')
      .field('cardLast4', '2222')
      .field('proofCardholderName', 'Karimov Kamol')
      .field('cardholderName', 'Eski Ism')
      .attach('receipts', png(), { filename: 'both.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    const row = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(row!.proofCardLast4).toBe('1111');
    expect(row!.proofCardholderName).toBe('Karimov Kamol');
  });

  it('tasdiq: eski nomlar orqaga moslik saqlanadi (cardLast4/cardholderName)', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('cardLast4', '3333')
      .field('cardholderName', 'Eski Ism')
      .attach('receipts', png(), { filename: 'legacy.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    const row = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(row!.proofCardLast4).toBe('3333');
  });

  it('tasdiq: last4 maydoni yo\'q -> 400 INVALID_CARD_LAST4', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('proofCardholderName', 'Aliyev Ali')
      .attach('receipts', png(), { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CARD_LAST4'); // xato kodi mijozga aniq
  });

  it('tasdiq: oxirgi 4 raqam noto\'g\'ri formatda -> 400', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('cardLast4', '12345678') // to'liq raqam — QABUL QILINMAYDI
      .field('cardholderName', 'Aliyev Ali')
      .attach('receipts', png(), { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('tasdiq: ism-familiya bo\'sh -> 400', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('cardLast4', '4321')
      .attach('receipts', png(), { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('tasdiq: BOSHQA foydalanuvchi yubora olmaydi -> 403', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', otherToken)
      .field('cardLast4', '4321')
      .field('cardholderName', 'Aliyev Ali')
      .attach('receipts', png(), { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('tasdiq: 1..3 ta chek + oxirgi 4 raqam + ism -> 200, lekin PAID EMAS', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('cardLast4', ' 4321 ')
      .field('cardholderName', '  Aliyev   Ali  ')
      .attach('receipts', png(), { filename: 'c1.png', contentType: 'image/png' })
      .attach('receipts', png(), { filename: 'c2.png', contentType: 'image/png' })
      .attach('receipts', png(), { filename: 'c3.png', contentType: 'image/png' });

    expect(res.status).toBe(200);

    const row = await prisma.payment.findUnique({ where: { id: p.id }, include: { evidences: true } });
    expect(row!.status).toBe('PENDING');          // <- hali PAID EMAS
    expect(row!.paidAt).toBeNull();
    expect(row!.proofCardLast4).toBe('4321');     // toza
    expect(row!.proofCardholderName).toBe('Aliyev Ali'); // bo'shliqlar tozalangan
    expect(row!.proofSubmittedAt).toBeTruthy();
    expect(row!.evidences.length).toBe(3);

    // TO'LIQ karta raqami hech qayerda saqlanmagan
    const audit = await prisma.paymentAuditLog.findMany({ where: { paymentId: p.id } });
    expect(JSON.stringify(audit)).not.toContain('8600123456784321');
  });

  it('tasdiq: 4 ta chek -> rad etiladi (maksimum 3)', async () => {
    const p = await makeTransferPayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('cardLast4', '4321')
      .field('cardholderName', 'Aliyev Ali')
      .attach('receipts', png(), { filename: 'a.png', contentType: 'image/png' })
      .attach('receipts', png(), { filename: 'b.png', contentType: 'image/png' })
      .attach('receipts', png(), { filename: 'c.png', contentType: 'image/png' })
      .attach('receipts', png(), { filename: 'd.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('tasdiq: allaqachon PAID to\'lovga yuborilmaydi -> 400', async () => {
    const p = await makeTransferPayment({ status: 'PAID' });
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('cardLast4', '4321')
      .field('cardholderName', 'Aliyev Ali')
      .attach('receipts', png(), { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('tasdiq: qayta yuborilsa eski cheklar arxivlanadi (to\'plamib ketmaydi)', async () => {
    const p = await makeTransferPayment();
    const post = () =>
      api()
        .post(`/api/payments/${p.id}/proof`)
        .set('Authorization', userToken)
        .set('X-Forwarded-For', nextIp())
        .field('cardLast4', '9999')
        .field('cardholderName', 'Aliyev Ali')
        .attach('receipts', png(), { filename: 'x.png', contentType: 'image/png' });

    await post();
    const first = await prisma.paymentEvidence.findMany({ where: { paymentId: p.id, status: 'SUBMITTED' } });
    expect(first.length).toBe(1);

    await post();
    const stillOpen = await prisma.paymentEvidence.findMany({ where: { paymentId: p.id, status: 'SUBMITTED' } });
    expect(stillOpen.length).toBe(1); // faqat eng yangisi
  });

  // ---------------- Qarz / kassa ----------------

  it('qarz: USER faqat o\'z qarzini ko\'radi', async () => {
    await makeTransferPayment({ isDebt: true, amount: 50000, type: 'REMAINING', method: 'CASH', dueAt: new Date(Date.now() + 86_400_000) });

    const mine = await api().get('/api/payments/debts').set('Authorization', userToken);
    expect(mine.status).toBe(200);
    expect(mine.body.data.debts.length).toBeGreaterThan(0);
    expect(mine.body.data.debts.every((d: any) => d.user.id === userId)).toBe(true);

    const otherRes = await api().get('/api/payments/debts').set('Authorization', otherToken);
    expect(otherRes.body.data.debts.length).toBe(0);
  });

  it('qarz: tasdiqlash faqat ADMIN/SUPER_ADMIN -> USER rad etiladi', async () => {
    const debt = await makeTransferPayment({ isDebt: true, amount: 50000, type: 'REMAINING', method: 'CASH' });
    const res = await api().post(`/api/payments/${debt.id}/settle`).set('Authorization', userToken).send({});
    expect(res.status).toBe(403);
  });

  it('qarz: admin kassada to\'landi deb tasdiqlaydi (settledAt + settledBy)', async () => {
    const debt = await makeTransferPayment({ isDebt: true, amount: 50000, type: 'REMAINING', method: 'CASH' });

    const res = await api().post(`/api/payments/${debt.id}/settle`).set('Authorization', superAdminToken).send({});
    expect(res.status).toBe(200);

    const row = await prisma.payment.findUnique({ where: { id: debt.id }, include: { settledBy: true } });
    expect(row!.status).toBe('PAID');
    expect(row!.settledAt).toBeTruthy();
    expect(row!.settledBy).toBeTruthy();
    expect(row!.method).toBe('CASH');

    const audit = await prisma.paymentAuditLog.findMany({ where: { paymentId: debt.id, action: 'debt_settled_cash' } });
    expect(audit.length).toBe(1);
  });

  it('qarz: allaqachon tasdiqlangan qarz qayta yopilmaydi -> 400', async () => {
    const debt = await makeTransferPayment({ isDebt: true, amount: 50000, type: 'REMAINING', method: 'CASH', status: 'PAID', settledAt: new Date(), settledById: userId });
    const res = await api().post(`/api/payments/${debt.id}/settle`).set('Authorization', superAdminToken).send({});
    expect(res.status).toBe(400);
  });

  it('qarz: to\'lanmagan qarz yopilgach "open" ro\'yxatidan chiqadi', async () => {
    const res = await api().get('/api/payments/debts?open=1').set('Authorization', userToken);
    expect(res.body.data.debts.every((d: any) => d.settledAt === null)).toBe(true);
  });

  it('qarz emas, LEKIN kutilayotgan qo\'lda to\'lov (CASH) kassada tasdiqlanadi', async () => {
    // Mijoz naqd to'lov yaratdi, admin kassada pulni oldi -> "Kassada to'ladi".
    // Ilgari bu to'lov "kutilmoqda" da qolib ketardi (till faqat qarzlarni
    // ko'rsatardi), endi bir bosishda tasdiqlanadi.
    const p = await makeTransferPayment({ method: 'CASH' });
    const res = await api().post(`/api/payments/${p.id}/settle`).set('Authorization', superAdminToken).send({});
    expect(res.status).toBe(200);

    const row = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(row!.status).toBe('PAID');
    expect(row!.settledAt).toBeTruthy();
    expect(row!.method).toBe('CASH');

    const audit = await prisma.paymentAuditLog.findMany({ where: { paymentId: p.id, action: 'manual_payment_settled' } });
    expect(audit.length).toBe(1);
  });

  it('kutilayotgan TRANSFER to\'lovi kassada ro\'yxatda chiqadi (last4 + ism + cheklar)', async () => {
    const p = await makeTransferPayment({ method: 'TRANSFER', proofCardLast4: '4321', proofCardholderName: 'Aliyev Ali', proofSubmittedAt: new Date() });
    await prisma.paymentEvidence.create({
      data: {
        paymentId: p.id, bookingId, uploadedById: userId,
        fileUrl: '/uploads/evidence/x.png', fileName: 'x.png',
        mimeType: 'image/png', sizeBytes: 100, status: 'SUBMITTED',
      },
    });

    const res = await api().get('/api/payments/debts').set('Authorization', superAdminToken);
    expect(res.status).toBe(200);
    const found = (res.body.data.pending as any[]).find((x) => x.id === p.id);
    expect(found).toBeTruthy();
    expect(found.method).toBe('TRANSFER');
    expect(found.cardLast4).toBe('4321');
    expect(found.cardholderName).toBe('Aliyev Ali');
    expect(found.receipts.length).toBe(1);
    expect(found.bookingLabel).toBeTruthy();

    // USER "kutilmoqda" ro'yxatni KO'RMASDI (faqat admin kassada ko'radi)
    const userRes = await api().get('/api/payments/debts').set('Authorization', userToken);
    expect((userRes.body.data.pending as any[]).length).toBe(0);
  });

  it('kutilayotgan TRANSFER to\'lovi tasdiqlanganda: PAID + cheklar APPROVED + mijozga xabar', async () => {
    const p = await makeTransferPayment({ method: 'TRANSFER', proofCardLast4: '7788', proofCardholderName: 'Karimov Sardor' });
    const ev = await prisma.paymentEvidence.create({
      data: {
        paymentId: p.id, bookingId, uploadedById: userId,
        fileUrl: '/uploads/evidence/y.png', fileName: 'y.png',
        mimeType: 'image/png', sizeBytes: 100, status: 'SUBMITTED',
      },
    });

    const res = await api().post(`/api/payments/${p.id}/settle`).set('Authorization', superAdminToken).send({});
    expect(res.status).toBe(200);

    const row = await prisma.payment.findUnique({ where: { id: p.id }, include: { evidences: true } });
    expect(row!.status).toBe('PAID');
    expect(row!.method).toBe('TRANSFER'); // usul saqlanadi (bank orqali kelgan)
    expect(row!.evidences.find((e) => e.id === ev.id)!.status).toBe('APPROVED');

    // mijoz darhol xabar oladi
    const notes = await prisma.notification.findMany({ where: { userId, title: { contains: 'tasdiqlandi' } } });
    expect(notes.length).toBeGreaterThan(0);

    // tasdiqlangan to'lov "kutilmoqda" ro'yxatidan chiqadi
    const list = await api().get('/api/payments/debts').set('Authorization', superAdminToken);
    expect((list.body.data.pending as any[]).some((x) => x.id === p.id)).toBe(false);
  });

  it('kutilayotgan qo\'lda to\'lovi qayta tasdiqlansa -> 400 (idempotent emas, xato)', async () => {
    const p = await makeTransferPayment({ method: 'CASH', status: 'PAID', settledAt: new Date(), settledById: userId });
    const res = await api().post(`/api/payments/${p.id}/settle`).set('Authorization', superAdminToken).send({});
    expect(res.status).toBe(400);
  });

  it('ONLAYN to\'lovni (PAYME) kassada tasdiqlab bo\'lmaydi -> 400', async () => {
    const p = await makeTransferPayment({ method: 'PAYME', provider: 'PAYME' });
    const res = await api().post(`/api/payments/${p.id}/settle`).set('Authorization', superAdminToken).send({});
    expect(res.status).toBe(400);
  });
});

/** TRANSFER metodi orqali to'lov sessiyasi yaratish (dogaon karta bilan) */
describe("E2E: O'tkazma to'lov sessiyasi yaratish (create + karta)", () => {
  let superAdminToken: string;
  let userToken: string;
  let userId: string;
  let roomId: string;

  beforeAll(async () => {
    await resetDb();
    const superAdmin = await createUserDirect({ email: 'tr-super@e2e.test', password: 'secret123', fullName: 'SA', role: 'SUPER_ADMIN' });
    const user = await createUserDirect({ email: 'tr-user@e2e.test', password: 'secret123', fullName: 'User' });
    superAdminToken = auth((await loginViaApi(superAdmin.email, 'secret123')).body.data.accessToken);
    userToken = auth((await loginViaApi(user.email, 'secret123')).body.data.accessToken);
    userId = user.id;
    const fixture = await createRoomFixture(superAdmin.id);
    roomId = fixture.room.id;
  });

  it('TRASFER metodi qabul qilinadi: PENDING + checkoutUrl YO\'Q + karta qaytariladi', async () => {
    const { zone } = await createRoomFixture(await createUserDirect({ email: 'tr-other@e2e.test', password: 'secret123', role: 'ADMIN' }).then((u) => u.id), roomId);
    void zone;
    // foydalanuvchining broni
    const rooms = await prisma.computerRoom.findFirst({ where: { id: roomId }, include: { zones: true } });
    const booking = await prisma.booking.create({
      data: {
        userId, roomId, zoneId: rooms!.zones[0].id,
        date: new Date('2026-12-01'), startTime: '14:00', endTime: '17:00',
        durationHours: 3, totalPrice: 100000, finalPrice: 100000,
        advanceAmount: 30000, remainingAmount: 70000, depositPercent: 30,
        status: 'PENDING',
      },
    });

    await prisma.siteSetting.upsert({
      where: { key: 'payment_card_number' },
      update: { value: '8600123456784321' },
      create: { key: 'payment_card_number', value: '8600123456784321' },
    });

    const res = await api().post('/api/payments/create').set('Authorization', userToken).send({
      bookingId: booking.id,
      method: 'TRANSFER',
    });

    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.manual).toBe(true);
    expect(d.checkoutUrl).toBeNull();
    expect(d.merchantCard.number).toBe('8600123456784321');
    expect(d.merchantCard.numberFormatted).toBe('8600 1234 5678 4321');

    const row = await prisma.payment.findUnique({ where: { id: d.payment.id } });
    expect(row!.method).toBe('TRANSFER');
    expect(row!.status).toBe('PENDING');
    expect(row!.provider).toBeNull(); // provayder YO'Q
    expect(row!.paidAt).toBeNull();   // hali to'lanmagan

    // bron "to'lov kutilmoqda" holatiga o'tdi
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b!.status).toBe('PENDING_PAYMENT');
  });

  it('noma\'lum metod -> 400 (TRANSFER faqat qo\'shilgan metod)', async () => {
    const rooms = await prisma.computerRoom.findFirst({ where: { id: roomId }, include: { zones: true } });
    const booking = await prisma.booking.create({
      data: {
        userId, roomId, zoneId: rooms!.zones[0].id,
        date: new Date('2026-12-02'), startTime: '10:00', endTime: '12:00',
        durationHours: 2, totalPrice: 50000, finalPrice: 50000,
        advanceAmount: 15000, remainingAmount: 35000, depositPercent: 30,
        status: 'PENDING',
      },
    });
    const res = await api().post('/api/payments/create').set('Authorization', userToken)
      .send({ bookingId: booking.id, method: 'CRYPTO' });
    expect(res.status).toBe(400);
  });
});
