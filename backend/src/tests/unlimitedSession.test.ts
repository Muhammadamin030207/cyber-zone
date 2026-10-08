import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startSessionGate } from '../services/sessionService';
import { computeBookingPrice } from '../utils/pricing';
import { round2 } from '../utils/money';

/**
 * SESSIYA GEYT (startSessionGate) — TIMED vs UNLIMITED.
 *
 * Foydalanuvchi talabi: cheksiz (UNLIMITED) sessiyada endTime/countdown
 * bo'lmaydi, sessiya ACTIVE turib beradi va faqat admin yoki foydalanuvchi
 * "check-out" bosganda yopiladi. Worker bunday sessiyani avtomatik yopmaydi.
 */

/**
 * Face provider mavjudligini test boshqaradi.
 *
 * SessionService `FACE_NOT_VERIFIED` ni FAQAT provider sozlangan bo'lgandagina
 * qaytaradi (NOT_CONFIGURED -> enforcement o'tkaziladi, fake PASS EMAS).
 * Shu sabab test ikkala holatni ham tekshiradi:
 *   - provider sozlangan   -> FACE_NOT_VERIFIED
 *   - provider NOT_CONFIGURED -> sessiya ruxsat etiladi (bloklanmaydi)
 */
const faceState = vi.hoisted(() => ({ available: false }));

vi.mock('../services/face/registry', () => ({
  isTrustedFaceVerificationAvailable: () => faceState.available,
  faceProviderId: () => (faceState.available ? 'aws' : 'none'),
  getFaceProvider: () => ({
    id: faceState.available ? 'aws' : 'none',
    isConfigured: () => faceState.available,
  }),
}));

const base = {
  status: 'PAID' as const,
  approvalStatus: 'APPROVED' as const,
  date: new Date('2026-09-28T00:00:00Z'),
  sessionStartedAt: null as Date | null,
  sessionEndedAt: null as Date | null,
};

describe('startSessionGate — UNLIMITED', () => {
  it('vaqt oynasi tugasa ham "window closed" BERMAYDI (sessiya ochiq turadi)', () => {
    // Bron vaqti: 09:00-10:00. Hozir 20:00 — TIMED uchun oyna yopilgan bo'lar edi.
    const gate = startSessionGate(
      { ...base, sessionType: 'UNLIMITED', startTime: '09:00', endTime: '10:00' },
      new Date('2026-09-28T20:00:00Z'),
    );
    expect(gate.ok).toBe(true);
    expect(gate.code).toBeUndefined();
  });

  it('boshlanish vaqtidan oldin hali ham rad etadi (ERTA kelgan foydalanuvchi)', () => {
    // 09:00 Toshkent = 04:00 UTC. 07:00 Toshkent (02:00 UTC) — hali erta.
    const gate = startSessionGate(
      { ...base, sessionType: 'UNLIMITED', startTime: '09:00', endTime: '10:00' },
      new Date('2026-09-28T02:00:00Z'),
    );
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('SESSION_EARLY');
  });

  it('boshlanmaganida ham TIMED kabi ishlaydi — rad etilmaydi', () => {
    const gate = startSessionGate(
      { ...base, sessionType: 'UNLIMITED', startTime: '09:00', endTime: '10:00' },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(true);
    expect(gate.bookedEnd.getTime()).toBeGreaterThan(gate.bookedStart.getTime() + 23 * 3600_000);
  });
});

describe('startSessionGate — TIMED (eskisiga regress)', () => {
  it('vaqt oynasi tugasa yopadi', () => {
    const gate = startSessionGate(
      { ...base, sessionType: 'TIMED', startTime: '09:00', endTime: '10:00' },
      new Date('2026-09-28T20:00:00Z'),
    );
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('SESSION_WINDOW_CLOSED');
  });

  it('sessionType berilmasa (default) TIMED hisoblanadi', () => {
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00' },
      new Date('2026-09-28T20:00:00Z'),
    );
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('SESSION_WINDOW_CLOSED');
  });
});

describe('startSessionGate — yuz tekshiruvi (liveness)', () => {
  beforeEach(() => { faceState.available = false; });

  it('talab yoqilgan bo\'lsa va yuz tekshirilmagan bo\'lsa FACE_NOT_VERIFIED', () => {
    faceState.available = true;
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceCheckRequired: true, faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('FACE_NOT_VERIFIED');
  });

  it('provider NOT_CONFIGURED bo\'lsa enforcement o\'tkaziladi (sessiya bloklanmaydi, fake PASS yo\'q)', () => {
    faceState.available = false;
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceCheckRequired: true, faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    // `faceVerifiedAt` YOZILMAYDI — faqat geyt e'tibordan chiqaradi.
    expect(gate.ok).toBe(true);
    expect(gate.code).toBeUndefined();
  });

  it('talab yoqilgan bo\'lsa-yu tekshiruv o\'tgan bo\'lsa ruxsat beradi', () => {
    faceState.available = true;
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceCheckRequired: true, faceVerifiedAt: new Date('2026-09-28T11:00:00Z') },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(true);
  });

  it('talab o\'chirilgan bo\'lsa tekshiruvsiz ham ruxsat beradi', () => {
    faceState.available = true;
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceCheckRequired: false, faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(true);
  });

  it('faceCheckRequired aniq berilmasa (eski chaqiruvlar) tekshiruv talab qilinmaydi', () => {
    faceState.available = true;
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(true);
  });
});

/**
 * To'lov holati yuz tekshiruvidan OLDIN tekshirilishi kerak. Aks holda
 * to'lanmagan bronda mijoz "kameraga qarang" xatosini oladi, yuz
 * tekshiruvini o'tkazadi, keyin yana "to'lanmagan" xatosini oladi.
 */
describe('startSessionGate — to\'lov yuz tekshiruvidan oldin', () => {
  beforeEach(() => { faceState.available = true; });

  it('to\'lanmagan + yuz tekshirilmagan -> avval TO\'LOV xatosi (chalg\'itmaydi)', () => {
    const gate = startSessionGate(
      { ...base, status: 'PENDING', startTime: '09:00', endTime: '10:00', faceCheckRequired: true, faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('BOOKING_NOT_PAID');
  });

  it('to\'langan + yuz tekshirilmagan -> endi yuz tekshiruvi xatosi', () => {
    const gate = startSessionGate(
      { ...base, status: 'PAID', startTime: '09:00', endTime: '10:00', faceCheckRequired: true, faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('FACE_NOT_VERIFIED');
  });
});

/**
 * UNLIMITED narxlash: faqat 1 soat OLDINDAN to'lanadi — 30% emas.
 * Spec: "user pays ONLY ONE HOUR IN ADVANCE". Qoldiq 0, keyingi soatlar
 * `finalizeSession` da haqiqiy sarf bo'yicha qarz qilinadi.
 */
describe('computeBookingPrice — UNLIMITED (prepayFull)', () => {
  it('1 soat = to\'liq narx oldindan to\'lanadi, qoldiq 0', () => {
    const p = computeBookingPrice({ pricePerHour: 20000, durationHours: 1, prepayFull: true });
    expect(p.baseTotal).toBe(20000);
    expect(p.advance).toBe(20000);
    expect(p.remaining).toBe(0);
    expect(p.depositPercent).toBe(100);
  });

  it('promo chegirmasi bir soatlik SUMMAga qo\'llanadi', () => {
    const p = computeBookingPrice({
      pricePerHour: 20000, durationHours: 1, prepayFull: true,
      promo: { discountType: 'PERCENTAGE', discountValue: 10 },
    });
    expect(p.baseTotal).toBe(20000);
    expect(p.discountPromo).toBe(2000);
    expect(p.finalTotal).toBe(18000);
    // Chegirma keyin to'lanadi: 18 000 to'liq oldindan
    expect(p.advance).toBe(18000);
    expect(p.remaining).toBe(0);
  });

  it('bonus balllar ham 1 soatlik summa ustida (50% cap)', () => {
    const p = computeBookingPrice({ pricePerHour: 20000, durationHours: 1, prepayFull: true, pointsToUse: 99999 });
    expect(p.pointsUsed).toBe(10000); // 50% cap
    expect(p.finalTotal).toBe(10000);
    expect(p.advance).toBe(10000);
    expect(p.remaining).toBe(0);
  });

  it('`advance + remaining === finalTotal` kafolati UNLIMITED uchun ham saqlanadi', () => {
    for (const price of [15000, 20000, 33333, 123457]) {
      const p = computeBookingPrice({ pricePerHour: price, durationHours: 1, prepayFull: true });
      expect(round2(p.advance + p.remaining)).toBe(p.finalTotal);
    }
  });

  it('TIMED oqim o\'zgarmaydi: 30% avans + 70% qoldiq', () => {
    const p = computeBookingPrice({ pricePerHour: 20000, durationHours: 2 });
    expect(p.baseTotal).toBe(40000);
    expect(p.advance).toBe(12000);
    expect(p.remaining).toBe(28000);
  });
});