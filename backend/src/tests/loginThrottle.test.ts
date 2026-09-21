import { describe, it, expect } from 'vitest';
import { getLockState, computeAfterFailure, lockDurationMs, resetData } from '../utils/loginThrottle';
import { config } from '../config';

const MAX = config.security.loginMaxAttempts;

describe('loginThrottle', () => {
  it('getLockState: null user — bloklanmagan', () => {
    const s = getLockState(null);
    expect(s.locked).toBe(false);
    expect(s.lockedUntil).toBeNull();
    expect(s.retryAfterSeconds).toBe(0);
  });

  it('getLockState: kelajakdagi lock — bloklangan va retry sekundlari to\'g\'ri', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const until = new Date(now.getTime() + 125_000);
    const s = getLockState({ loginLockedUntil: until }, now);
    expect(s.locked).toBe(true);
    expect(s.lockedUntil?.getTime()).toBe(until.getTime());
    expect(s.retryAfterSeconds).toBe(125);
  });

  it('getLockState: o\'tgan lock — endi bloklanmagan', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const until = new Date(now.getTime() - 1000);
    expect(getLockState({ loginLockedUntil: until }, now).locked).toBe(false);
  });

  it('computeAfterFailure: MAX-1 xatodan keyin hali bloklanmaydi', () => {
    const out = computeAfterFailure({ failedLoginAttempts: MAX - 2, loginLockStage: 0 });
    expect(out.locked).toBe(false);
    expect(out.remainingAttempts).toBe(1);
    expect(out.data.failedLoginAttempts).toBe(MAX - 1);
    expect(out.data.loginLockedUntil).toBeNull();
  });

  it('computeAfterFailure: MAX xatoda bloklaydi va hisoblagichni nolga tushiradi', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const out = computeAfterFailure({ failedLoginAttempts: MAX - 1, loginLockStage: 0 }, now);
    expect(out.locked).toBe(true);
    expect(out.lockedUntil).not.toBeNull();
    expect(out.lockedUntil!.getTime()).toBe(now.getTime() + lockDurationMs(0));
    expect(out.data.failedLoginAttempts).toBe(0);
    expect(out.data.loginLockStage).toBe(1);
    expect(out.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('lockDurationMs: bosqich oshgani sari muddat kamaymaydi va cheksiz o\'smaydi', () => {
    for (let i = 1; i <= 6; i++) {
      expect(lockDurationMs(i)).toBeGreaterThanOrEqual(lockDurationMs(i - 1));
    }
    // Eng katta bosqichdan keyin ham oxirgi qiymat qoladi (cheksiz o\'sish yo\'q)
    expect(lockDurationMs(9999)).toBe(lockDurationMs(1000));
  });

  it('resetData: barcha hisoblagichlarni nolga tushiradi', () => {
    expect(resetData()).toEqual({ failedLoginAttempts: 0, loginLockStage: 0, loginLockedUntil: null });
  });
});
