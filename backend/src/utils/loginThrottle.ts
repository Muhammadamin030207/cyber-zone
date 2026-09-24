import { config } from '../config';

/**
 * Login brute-force himoyasi yordamchilari.
 *
 * Mantiq: ketma-ket `loginMaxAttempts` marta xato parol kiritilsa, hisob
 * vaqtincha bloklanadi. Blok muddati 24-soatgacha (default: 1440 daqiqa,
 * spec §4.2 — 10-chi xato urinishdan keyin locked_until = now + 24h).
 * Blok tugagach hisoblagich noldan boshlanadi. Muvaffaqiyatli login
 * barcha hisoblagichlarni nolga tushiradi.
 */

const lockDurationsMs: number[] = (() => {
  const minutes = config.security.loginLockMinutes.length ? config.security.loginLockMinutes : [5];
  return minutes.map((m) => m * 60_000);
})();

/** Berilgan bosqich uchun blok muddati (oxirgi bosqichdan keyin ham shu qoladi). */
export function lockDurationMs(stage: number): number {
  const idx = Math.min(Math.max(stage, 0), lockDurationsMs.length - 1);
  return lockDurationsMs[idx];
}

export interface LoginLockState {
  locked: boolean;
  lockedUntil: Date | null;
  retryAfterSeconds: number;
}

/** Hisob hozir bloklanganmi. Blok muddati o'tgan bo'lsa — bloklangan emas. */
export function getLockState(
  user: { loginLockedUntil?: Date | null } | null | undefined,
  now: Date = new Date()
): LoginLockState {
  const until = user?.loginLockedUntil ? new Date(user.loginLockedUntil) : null;
  if (until && until.getTime() > now.getTime()) {
    return {
      locked: true,
      lockedUntil: until,
      retryAfterSeconds: Math.ceil((until.getTime() - now.getTime()) / 1000),
    };
  }
  return { locked: false, lockedUntil: null, retryAfterSeconds: 0 };
}

export interface FailureOutcome {
  locked: boolean;
  lockedUntil: Date | null;
  retryAfterSeconds: number;
  remainingAttempts: number;
  /** DB'ga yoziladigan yangilanish maydonlari. */
  data: {
    failedLoginAttempts: number;
    loginLockStage: number;
    loginLockedUntil: Date | null;
  };
}

/** Xato paroldan keyin yoziladigan holatni hisoblaydi (lock boshlanishi mumkin). */
export function computeAfterFailure(
  user: { failedLoginAttempts?: number | null; loginLockStage?: number | null },
  now: Date = new Date()
): FailureOutcome {
  const max = config.security.loginMaxAttempts;
  const attempts = (user.failedLoginAttempts || 0) + 1;

  if (attempts >= max) {
    const stage = user.loginLockStage || 0;
    const durationMs = lockDurationMs(stage);
    const lockedUntil = new Date(now.getTime() + durationMs);
    return {
      locked: true,
      lockedUntil,
      retryAfterSeconds: Math.ceil(durationMs / 1000),
      remainingAttempts: 0,
      data: {
        failedLoginAttempts: 0,
        loginLockStage: Math.min(stage + 1, lockDurationsMs.length),
        loginLockedUntil: lockedUntil,
      },
    };
  }

  return {
    locked: false,
    lockedUntil: null,
    retryAfterSeconds: 0,
    remainingAttempts: max - attempts,
    data: {
      failedLoginAttempts: attempts,
      loginLockStage: user.loginLockStage || 0,
      loginLockedUntil: null,
    },
  };
}

/** Muvaffaqiyatli login uchun hisoblagichlarni nolga tushiradigan maydonlar. */
export function resetData(): {
  failedLoginAttempts: number;
  loginLockStage: number;
  loginLockedUntil: null;
} {
  return { failedLoginAttempts: 0, loginLockStage: 0, loginLockedUntil: null };
}
