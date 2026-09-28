import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb as reset, createUserDirect, createRoomFixture, nextIp, prisma } from './helpers';
import { tashkentTodayISO, tashkentNowHHMM, parseTime, minutesToHHMM } from '../../utils/time';

function auth(t: string) { return `Bearer ${t}`; }

async function login(email: string, password = 'secret123') {
  const res = await api().post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password });
  return res.body.data.accessToken as string;
}

/**
 * No-show oqimi: bron yopilgan (kelmagan) holatda admin qarori.
 *  - action='REFUND'  → to'lov REFUNDED, ballar/promo qaytariladi
 *  - action='FORFEIT' → avans xonada qoladi
 */
describe('E2E: No-show qarori (avansni qaytarish / ushlab qolish)', () => {
  let adminToken: string;
  let adminId: string;
  let otherToken: string;
  let userId: string;
  let roomId: string;
  let zoneId: string;
  let counter = 0;

  beforeEach(async () => {
    await reset();
    const admin = await createUserDirect({ email: `ns-admin-${Date.now()}@e2e.test`, password: 'secret123', role: 'SUPER_ADMIN' });
    const other = await createUserDirect({ email: `ns-other-${Date.now()}@e2e.test`, password: 'secret123', role: 'ADMIN' });
    const user = await createUserDirect({ email: `ns-user-${Date.now()}@e2e.test`, password: 'secret123' });
    adminId = admin!.id;
    adminToken = await login(admin!.email);
    otherToken = await login(other!.email);
    userId = user!.id;
    const fx = await createRoomFixture(admin!.id);
    roomId = fx.room.id;
    zoneId = fx.zone.id;
    counter = 0;
  });

  /** Kelmagan bron: tasdiqlangan, sessiya BOSHLANMAGAN, avans to'langan */
  async function noShowBooking(paid = true) {
    counter += 1;
    const nowMin = parseTime(tashkentNowHHMM()) ?? 720;
    const b = await prisma.booking.create({
      data: {
        userId,
        roomId,
        zoneId,
        date: new Date(`${tashkentTodayISO()}T00:00:00.000Z`),
        startTime: minutesToHHMM(Math.max(0, nowMin - 120)),
        endTime: minutesToHHMM(Math.max(0, nowMin - 60)),
        durationHours: 1,
        totalPrice: 40000,
        finalPrice: 40000,
        advanceAmount: 12000,
        remainingAmount: 28000,
        depositPercent: 30,
        status: 'COMPLETED',
        approvalStatus: 'APPROVED',
        // yopilgan no-show belgilari
        sessionStartedAt: null,
        sessionEndedAt: new Date(),
        actualDurationMinutes: 0,
        actualPrice: 0,
        billingAdjustment: 0,
        autoClosed: true,
      },
    });
    if (paid) {
      await prisma.payment.create({
        data: {
          bookingId: b.id,
          userId,
          amount: 12000,
          type: 'ADVANCE',
          method: 'CASH',
          status: 'PAID',
          paidAt: new Date(),
          currency: 'UZS',
          depositPercent: 30,
        },
      });
    }
    return b;
  }

  it('REFUND: to\'lov REFUNDED bo\'ladi, qaror yoziladi, mijozga xabar bor', async () => {
    const b = await noShowBooking(true);
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken))
      .send({ action: 'refund', reason: 'Mijoz kelmaydi, telefon qilindi' });

    expect(res.status).toBe(200);
    expect(res.body.data.noShowOutcome).toBe('REFUND');
    expect(res.body.data.refundTotal).toBe(12000);
    expect(res.body.data.paymentsRefunded).toBe(1);

    const p = await prisma.payment.findFirst({ where: { bookingId: b.id } });
    expect(p!.status).toBe('REFUNDED');

    const row = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(row!.noShowOutcome).toBe('REFUND');
    expect(row!.noShowHandledById).toBe(adminId);
    expect(row!.noShowHandledAt).toBeTruthy();

    const note = await prisma.notification.findFirst({ where: { userId, type: 'booking' } });
    expect(note?.title).toContain('qaytarildi');

    // moliyaviy audit yozildi
    const audit = await prisma.paymentAuditLog.findFirst({ where: { paymentId: p!.id, action: 'booking_no_show_refunded' } });
    expect(audit).toBeTruthy();
  });

  it('FORFEIT: to\'lov o\'z holatida qoladi (PAID), avans xonada ushlanadi', async () => {
    const b = await noShowBooking(true);
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken))
      .send({ action: 'forfeit', reason: 'Ikki marta telefon qilindi, javob yo\'q' });

    expect(res.status).toBe(200);
    expect(res.body.data.noShowOutcome).toBe('FORFEIT');
    expect(res.body.data.forfeitedTotal).toBe(12000);

    const p = await prisma.payment.findFirst({ where: { bookingId: b.id } });
    expect(p!.status).toBe('PAID'); // qaytarilmadi

    const row = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(row!.noShowOutcome).toBe('FORFEIT');
  });

  it('qaror ikkinchi marta qabul qilinmaydi (409-ish: 400 ALREADY_DECIDED)', async () => {
    const b = await noShowBooking(true);
    await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken)).send({ action: 'refund', reason: 'kelmadi' });
    const again = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken)).send({ action: 'forfeit', reason: 'qayta urinish' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('ALREADY_DECIDED');
  });

  it('sessiya boshlangan bron no-show emas — rad etiladi', async () => {
    const b = await noShowBooking(true);
    await prisma.booking.update({ where: { id: b.id }, data: { sessionStartedAt: new Date() } });
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken)).send({ action: 'refund', reason: 'kelmadi' });
    expect(res.status).toBe(400);
  });

  it('REFUND uchun sabab majburiy', async () => {
    const b = await noShowBooking(true);
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken)).send({ action: 'refund', reason: '' });
    expect(res.status).toBe(400);
  });

  it('noma\'lum action -> 400', async () => {
    const b = await noShowBooking(true);
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken)).send({ action: 'MONEY_PRINT' });
    expect(res.status).toBe(400);
  });

  it('USER qaror qabul qila olmaydi (403)', async () => {
    const b = await noShowBooking(true);
    const userTok = await login(`ns-user-`, 'secret123').catch(() => '');
    void userTok;
    const userEmail = (await prisma.booking.findUnique({ where: { id: b.id }, include: { user: true } }))!.user.email;
    const tok = await login(userEmail);
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(tok)).send({ action: 'refund', reason: 'kelmadi' });
    expect(res.status).toBe(403);
  });

  it('boshqa ADMIN (xona egasi emas) qaror qabul qila olmaydi (403)', async () => {
    const b = await noShowBooking(true);
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(otherToken)).send({ action: 'refund', reason: 'kelmadi' });
    expect(res.status).toBe(403);
  });

  it('bron topilmasa -> 404', async () => {
    const res = await api().patch('/api/bookings/admin/bookings/00000000-0000-0000-0000-000000000000/no-show')
      .set('Authorization', auth(adminToken)).send({ action: 'refund', reason: 'kelmadi' });
    expect(res.status).toBe(404);
  });

  it('to\'lov bo\'lmagan bron: FORFEIT ishlaydi, refund 0', async () => {
    const b = await noShowBooking(false);
    const res = await api().patch(`/api/bookings/admin/bookings/${b.id}/no-show`)
      .set('Authorization', auth(adminToken)).send({ action: 'refund', reason: 'bepul bekor qilindi' });
    expect(res.status).toBe(200);
    expect(res.body.data.refundTotal).toBe(0);
    expect(res.body.data.paymentsRefunded).toBe(0);
  });
});
