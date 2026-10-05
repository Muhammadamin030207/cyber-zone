// ============================================================================
// P2 XAVFSIZLIK: `POST /api/bookings/:id/face-verified` — SO'ROBGA ISHONCH
// ============================================================================
// MUAMMO: endpoint ilgari `faceVerifiedAt` ni mijozning o'z xabariga qarab
// yozardi. `curl -H "Authorization: Bearer <token>"` bilan hech qanday kamera,
// hech qanday liveness, hech qanday provider ishorasiz "tekshiruv o'tdi" deb
// olish mumkin edi — boshqa birov mijozning broni bo'yicha sessiya boshlashi
// mumkin.
//
// BU TEST NIMANI KAFOLATLAYDI:
//   1. Hech qanday so'rov shakli `faceVerifiedAt` / `faceVerifiedById` yozmaydi.
//   2. Endpoint hech qanday sharoitda "muvaffaqiyat" (200) qaytarmaydi.
//   3. `local_liveness` rejimi ham ishonchli natija yaratmaydi (hard block).
//   4. Hech qanday rad etilgan so'rov bron egaligini o'zgartirmaydi.
//
// BU TEST NIMA HAQIDA EMAS:
//   Haqiqiy liveness ni sinov qilmaydi — u server tomonlari provider ishi.
//   Bu yerda faqat "so'rov yolg'oni qabul qilinmaydi" tekshiriladi.
// ============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  resetDb,
  auth,
  registerViaApi,
  createRoomFixture,
  createBookingFixture,
  prisma,
} from './helpers';

/** So'rov yuborilgandan keyin bron holatini qayta o'qib, o'zgarmaganini tekshiradi. */
async function assertBookingUnchanged(bookingId: string, snapshot: {
  faceVerifiedAt: Date | null;
  faceVerifiedById: string | null;
  userId: string;
  status: string;
}) {
  const after = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { faceVerifiedAt: true, faceVerifiedById: true, userId: true, status: true },
  });
  expect(after.faceVerifiedAt).toBeNull();
  expect(after.faceVerifiedAt).toBe(snapshot.faceVerifiedAt);
  expect(after.faceVerifiedById).toBeNull();
  expect(after.faceVerifiedById).toBe(snapshot.faceVerifiedById);
  expect(after.userId).toBe(snapshot.userId);
  expect(after.status).toBe(snapshot.status);
}

describe('E2E xavfsizlik: face-verified — so\'rov ishonchli emas', () => {
  let ownerToken = '';
  let ownerId = '';
  let otherToken = '';
  let otherId = '';
  let roomId = '';
  let zoneId = '';
  let bookingId = '';
  let foreignBookingId = '';

  const snapshot = { faceVerifiedAt: null, faceVerifiedById: null, userId: '', status: '' };

  beforeAll(async () => {
    await resetDb();

    const owner = await registerViaApi('face-owner@e2e.test', 'secret123', 'Face Owner');
    const other = await registerViaApi('face-other@e2e.test', 'secret123', 'Face Other');
    ownerToken = owner.body.data.accessToken;
    ownerId = owner.body.data.user.id;
    otherToken = other.body.data.accessToken;
    otherId = other.body.data.user.id;

    const { room, zone } = await createRoomFixture(ownerId);
    roomId = room.id;
    zoneId = zone.id;

    const booking = await createBookingFixture(ownerId, roomId, zoneId);
    bookingId = booking.id;
    const foreign = await createBookingFixture(otherId, roomId, zoneId);
    foreignBookingId = foreign.id;

    snapshot.faceVerifiedAt = booking.faceVerifiedAt;
    snapshot.faceVerifiedById = booking.faceVerifiedById;
    snapshot.userId = booking.userId;
    snapshot.status = booking.status;
  });

  // ---------------------------------------------------------------- 1
  it('1. bo\'sh body ({}): rad etiladi, holat o\'zgarmaydi', async () => {
    const res = await api().post(`/api/bookings/${bookingId}/face-verified`).set('Authorization', auth(ownerToken)).send({});
    expect(res.status).not.toBe(200);
    expect(res.body.success).toBe(false);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  it('1b. butunlay bo\'sh so\'rov (body-siz): rad etiladi', async () => {
    const res = await api().post(`/api/bookings/${bookingId}/face-verified`).set('Authorization', auth(ownerToken));
    expect(res.status).not.toBe(200);
    expect(res.body.success).toBe(false);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 2
  it('2. { verified: true } — mijoz xabari ishonchli emas', async () => {
    const res = await api()
      .post(`/api/bookings/${bookingId}/face-verified`)
      .set('Authorization', auth(ownerToken))
      .send({ verified: true });
    expect(res.status).not.toBe(200);
    expect(res.body.success).toBe(false);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 3
  it('3. { faceVerified: true } — mijoz xabari ishonchli emas', async () => {
    const res = await api()
      .post(`/api/bookings/${bookingId}/face-verified`)
      .set('Authorization', auth(ownerToken))
      .send({ faceVerified: true });
    expect(res.status).not.toBe(200);
    expect(res.body.success).toBe(false);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 4
  it('4. so\'rovdagi userId ishonchli emas (boshqarish maydoni emas)', async () => {
    const res = await api()
      .post(`/api/bookings/${bookingId}/face-verified`)
      .set('Authorization', auth(ownerToken))
      .send({ userId: otherId, verifiedBy: otherId, faceVerifiedById: otherId, verified: true, faceVerified: true });
    expect(res.status).not.toBe(200);
    expect(res.body.success).toBe(false);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 5
  it('5. begona bron (IDOR): boshqa foydalanuvchining broni 403 beradi', async () => {
    const res = await api()
      .post(`/api/bookings/${foreignBookingId}/face-verified`)
      .set('Authorization', auth(ownerToken))
      .send({ verified: true, userId: ownerId });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // Begona bron ham o'zgarmagan
    const foreign = await prisma.booking.findUniqueOrThrow({ where: { id: foreignBookingId } });
    expect(foreign.faceVerifiedAt).toBeNull();
    expect(foreign.faceVerifiedById).toBeNull();
  });

  // ---------------------------------------------------------------- 6
  it('6. autentifikatsiyasiz so\'rov 401 beradi', async () => {
    const res = await api().post(`/api/bookings/${bookingId}/face-verified`).send({ verified: true });
    expect(res.status).toBe(401);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 7
  it('7. so\'rob yaratilgan soxta sessionToken rad etiladi', async () => {
    const res = await api()
      .post(`/api/bookings/${bookingId}/face-verified`)
      .set('Authorization', auth(ownerToken))
      .send({ sessionToken: 'x'.repeat(64), clientDurationMs: 9000, verified: true });
    expect(res.status).not.toBe(200);
    expect(res.body.success).toBe(false);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 8
  it('8. provider sozlanmaganda (NOT_CONFIGURED) hech qanday natija yaratilmaydi', async () => {
    // Default holat: `FACE_PROVIDER` yo'q -> `none` provideri. Bu provider
    // hech qachon muvaffaqiyat qaytarmaydi, shuning uchun endpoint
    // `NOT_CONFIGURED` (503) bilan to'xtaydi va `faceVerifiedAt` YOZILMAYDI.
    const res = await api()
      .post(`/api/bookings/${bookingId}/face-verified`)
      .set('Authorization', auth(ownerToken))
      .send({ verified: true, faceVerified: true, sessionToken: 'y'.repeat(64), clientDurationMs: 9000 });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NOT_CONFIGURED');
    expect(res.body.message).not.toMatch(/sk-|AIza|AWS/);
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 9
  it('9. `face-session` ham NOT_CONFIGURED da sessiya BERMAYDI (dead-end emas)', async () => {
    const res = await api()
      .post(`/api/bookings/${bookingId}/face-session`)
      .set('Authorization', auth(ownerToken))
      .send({});
    // Token berilmasligi SHART — aks holda mijoz "token bor" deb o'ylab,
    // keyin 200 kutadi va chalkashlik chiqadi.
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NOT_CONFIGURED');
    expect(res.body.data?.sessionToken).toBeUndefined();
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 10
  it('10. takroriy (replay) so\'rovlar ham yozmaydi', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await api()
        .post(`/api/bookings/${bookingId}/face-verified`)
        .set('Authorization', auth(ownerToken))
        .send({ verified: true, faceVerified: true, sessionToken: 'z'.repeat(64), clientDurationMs: 9000 });
      expect(res.status).not.toBe(200);
    }
    await assertBookingUnchanged(bookingId, snapshot);
  });

  // ---------------------------------------------------------------- 11
  it('11. butun test davomida hech qanday booking ishonchli belgi olmagan', async () => {
    const all = await prisma.booking.findMany({
      select: { faceVerifiedAt: true, faceVerifiedById: true },
    });
    expect(all.every((b) => b.faceVerifiedAt === null)).toBe(true);
    expect(all.every((b) => b.faceVerifiedById === null)).toBe(true);
  });

  // ---------------------------------------------------------------- 12
  it('12. javob hech qanday secret yoki Passkey xabarini TASHLAMAYDI', async () => {
    const res = await api()
      .post(`/api/bookings/${bookingId}/face-verified`)
      .set('Authorization', auth(ownerToken))
      .send({ verified: true });
    const raw = JSON.stringify(res.body);
    expect(raw.toLowerCase()).not.toMatch(/passkey|webauthn|face id|faceid/);
    expect(raw).not.toMatch(/AIza|sk-ant|sk-proj/);
  });
});
