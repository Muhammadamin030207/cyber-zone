import { describe, it, expect } from 'vitest';
import { startSessionGate } from '../services/sessionService';

/**
 * SESSIYA GEYT (startSessionGate) — TIMED vs UNLIMITED.
 *
 * Foydalanuvchi talabi: cheksiz (UNLIMITED) sessiyada endTime/countdown
 * bo'lmaydi, sessiya ACTIVE turib beradi va faqat admin yoki foydalanuvchi
 * "check-out" bosganda yopiladi. Worker bunday sessiyani avtomatik yopmaydi.
 */

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
  it('talab yoqilgan bo\'lsa va yuz tekshirilmagan bo\'lsa FACE_NOT_VERIFIED', () => {
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceCheckRequired: true, faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('FACE_NOT_VERIFIED');
  });

  it('talab yoqilgan bo\'lsa-yu tekshiruv o\'tgan bo\'lsa ruxsat beradi', () => {
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceCheckRequired: true, faceVerifiedAt: new Date('2026-09-28T11:00:00Z') },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(true);
  });

  it('talab o\'chirilgan bo\'lsa tekshiruvsiz ham ruxsat beradi', () => {
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceCheckRequired: false, faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(true);
  });

  it('faceCheckRequired aniq berilmasa (eski chaqiruvlar) tekshiruv talab qilinmaydi', () => {
    const gate = startSessionGate(
      { ...base, startTime: '09:00', endTime: '10:00', faceVerifiedAt: null },
      new Date('2026-09-28T04:30:00Z'),
    );
    expect(gate.ok).toBe(true);
  });
});