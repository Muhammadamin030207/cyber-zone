import { describe, it, expect, beforeAll } from 'vitest';
import {
  api, resetDb, auth, loginViaApi, createUserDirect,
  createRoomFixture, createBookingFixture, prisma, nextIp,
} from './helpers';

/**
 * CHEK (o'tkazma tasdig'i) YUKLASH — REGRESSION TESTI
 * ==================================================
 *
 * BUGO (2026-10-05): foydalanuvchi chekni tanlaydi, "Chekni yuborish" bosildi
 * va server javob berdi:
 *
 *     "Kamida 1 ta o'tkazma cheki (screenshot) yuklang"
 *
 * ...bitta ham fayl tanlamagan holatdagi xabar bilan BIR XIL.
 *
 * ASOSIY SABAB: `frontend/src/lib/api.ts` da `axios.create({ headers: {
 * 'Content-Type': 'application/json' } })` bor edi. Axios'ning
 * `transformRequest` qoidasi (lib/defaults/index.js):
 *
 *     const hasJSONContentType = contentType.indexOf('application/json') > -1;
 *     if (isFormData) return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
 *
 * Ya'ni instance darajasidagi `Content-Type` header'i `FormData`ni oddiy JSON
 * obyektga aylantirib yuboradi (File -> `{}`). Server `express.json()` bilan
 * body'ni oladi; `multer` multipart deb TOG'RILAMAYDI (so'rov multipart emas!)
 * va `req.files` DOIM bo'sh bo'ladi. Natijada chek validatsiyasi ishlaydi va
 * xato chiqadi — qanchalik fayl tanlanganidan qat'i nazar.
 *
 * Bu test ikkala qismni ham qamrab oladi:
 *   1) MIJOZ TOMONIDAGI XATO — multipart so'rov (to'g'ri) -> 200 va DB yozuvi.
 *   2) ESKIRGAN/buzilgan MIJOZ TOMONI — JSON tanasi -> aniq, alohida kod bilan
 *      rad etiladi (`RECEIPTS_UPLOAD_MALFORMED`), "kamida 1 ta chek yuklang"
 *      kabi MISHDAN qaytarilmaydi. Shu bilan birga hech qanday PaymentEvidence
 *      YOZILMAYDI (yarim holat qolmaydi).
 */
describe("E2E: Chek (o'tkazma tasdig'i) yuklash — content-type regressiyasi", () => {
  let userToken: string;
  let userId: string;
  let bookingId: string;

  beforeAll(async () => {
    await resetDb();
    const owner = await createUserDirect({ email: 'rc-owner@e2e.test', password: 'secret123', role: 'SUPER_ADMIN' });
    const user = await createUserDirect({ email: 'rc-user@e2e.test', password: 'secret123', fullName: 'R C User' });
    userId = user.id;
    userToken = auth((await loginViaApi(user.email, 'secret123')).body.data.accessToken);

    const fixture = await createRoomFixture(owner.id);
    const booking = await createBookingFixture(userId, fixture.room.id, fixture.zone.id);
    bookingId = booking.id;
  });

  async function makePayment() {
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
      } as any,
    });
  }

  function png() {
    return Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  }

  // ------------------------------------------------------------------
  // 1) TO'G'RI yo'l: haqiqiy multipart so'rov (frontend tuzatilgan holat)
  // ------------------------------------------------------------------
  it('TO\'G\'RI: multipart chek yuklash -> 200, fayl DB ga saqlanadi', async () => {
    const p = await makePayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('proofCardLast4', '4321')
      .field('proofCardholderName', 'Aliyev Ali')
      .attach('receipts', png(), { filename: 'chek.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.receipts).toBe(1);

    const evidence = await prisma.paymentEvidence.findMany({ where: { paymentId: p.id } });
    expect(evidence.length).toBe(1);
    expect(evidence[0].status).toBe('SUBMITTED');
    expect(evidence[0].mimeType).toBe('image/png');
    expect(evidence[0].uploadedById).toBe(userId);
    // To'lov o'zi PAID bo'lmaydi
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe('PENDING');
  });

  // ------------------------------------------------------------------
  // 2) BUzilgan yo'l: multipart BODY, lekin header `application/json`
  //    (axios `Content-Type: application/json` + FormData -> aynan shu yuboradi)
  //    express.json() body'ni yeb ketadi -> multer multipart deb to'g'rilamaydi.
  // ------------------------------------------------------------------
  it('BUZILGAN: multipart body + `application/json` header -> aniq diagnoz, DB ga YOZILMAYDI', async () => {
    const p = await makePayment();
    const boundary = '----czRegressionBoundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="proofCardLast4"',
      '',
      '4321',
      `--${boundary}`,
      'Content-Disposition: form-data; name="proofCardholderName"',
      '',
      'Aliyev Ali',
      `--${boundary}`,
      'Content-Disposition: form-data; name="receipts"; filename="chek.png"',
      'Content-Type: image/png',
      '',
      '89504e470d0a1a0a',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .set('Content-Type', 'application/json')
      .send(body);

    // Noto'g'ri JSON -> 400. Asiy jihat: foydalanuvchiga "kamida 1 ta chek
    // yuklang" kabi MISHDAN xabar BERILMASDI.
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || '')).not.toContain('Kamida 1 ta');

    // Yarim holat QOLMADI: na tasdiq, na to'lov maydonlari yozilmadi
    expect(await prisma.paymentEvidence.count({ where: { paymentId: p.id } })).toBe(0);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.proofCardLast4).toBeNull();
    expect(row.proofSubmittedAt).toBeNull();
  });

  // ------------------------------------------------------------------
  // 3) Server-side diagnoz kodi: JSON body (axios FormData->JSON aylanishi)
  //    -> `RECEIPTS_UPLOAD_MALFORMED` (validatsiya o'chMAYDI, xabar aniq)
  // ------------------------------------------------------------------
  it('DIAGNOZ: JSON tanasi (fayllar "yo\'qoldi") -> RECEIPTS_UPLOAD_MALFORMED, chek talabi saqlanadi', async () => {
    const p = await makePayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .send({ proofCardLast4: '4321', proofCardholderName: 'Aliyev Ali', receipts: {} });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECEIPTS_UPLOAD_MALFORMED');
    // "Kamida 1 ta chek yuklang" endi FAQAT haqiqiy cheksiz multipart
    // so'rovda chiqadi (mijoz umuman fayl tanlamagan holat).
    expect(String(res.body.message || '')).not.toContain('Kamida 1 ta');
    expect(await prisma.paymentEvidence.count({ where: { paymentId: p.id } })).toBe(0);
  });

  // ------------------------------------------------------------------
  // 4) Haqiqiy cheksiz multipart -> eski, ANIQ "kamida 1 ta" xabari
  //    (validatsiya o'chmagan — faqat endi tashxis qo'yiladi)
  // ------------------------------------------------------------------
  it('CHEKSIZ multipart -> "Kamida 1 ta o\'tkazma cheki yuklang" (validatsiya saqlanadi)', async () => {
    const p = await makePayment();
    const res = await api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('proofCardLast4', '4321')
      .field('proofCardholderName', 'Aliyev Ali');

    expect(res.status).toBe(400);
    expect(String(res.body.message || '')).toContain('Kamida 1 ta');
    expect(res.body.code).toBeUndefined();
    expect(await prisma.paymentEvidence.count({ where: { paymentId: p.id } })).toBe(0);
  });

  // ------------------------------------------------------------------
  // 5) Ko'p fayl (4 ta) -> multer limiti. XATO bo'lsa ham yarim yozuv qolmasin.
  // ------------------------------------------------------------------
  it('4 ta chek -> rad etiladi, yarim yozuv qolMAYDI', async () => {
    const p = await makePayment();
    const req = api()
      .post(`/api/payments/${p.id}/proof`)
      .set('Authorization', userToken)
      .set('X-Forwarded-For', nextIp())
      .field('proofCardLast4', '4321')
      .field('proofCardholderName', 'Aliyev Ali');
    for (let i = 0; i < 4; i += 1) {
      req.attach('receipts', png(), { filename: `c${i}.png`, contentType: 'image/png' });
    }
    const res = await req;
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.paymentEvidence.count({ where: { paymentId: p.id } })).toBe(0);
  });
});