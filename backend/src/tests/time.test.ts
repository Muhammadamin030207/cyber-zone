import { describe, it, expect } from 'vitest';
import {
  parseTime,
  minutesToHHMM,
  normalizeSlot,
  slotsOverlap,
  freeWindowsInDay,
  normalizeWorkingHours,
  slotWithinWorkingHours,
  toISODate,
  tashkentTodayISO,
  tashkentDayISO,
} from '../utils/time';

describe('parseTime', () => {
  it('parses valid HH:mm', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1439);
    expect(parseTime('7:05')).toBe(425);
  });
  it('rejects invalid input', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('12:60')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('')).toBeNull();
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
});

describe('minutesToHHMM', () => {
  it('formats minutes', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(570)).toBe('09:30');
    expect(minutesToHHMM(1439)).toBe('23:59');
  });
  it('wraps past midnight', () => {
    expect(minutesToHHMM(1440)).toBe('00:00');
    expect(minutesToHHMM(1500)).toBe('01:00');
    expect(minutesToHHMM(-30)).toBe('23:30');
  });
});

describe('normalizeSlot', () => {
  it('normalizes end 00:00 to midnight of current day', () => {
    expect(normalizeSlot('23:00', '00:00')).toEqual({ start: 1380, end: 1440 });
  });
  it('extends past-midnight slots', () => {
    expect(normalizeSlot('23:00', '01:00')).toEqual({ start: 1380, end: 1500 });
  });
  it('keeps plain daytime slot', () => {
    expect(normalizeSlot('10:00', '12:00')).toEqual({ start: 600, end: 720 });
  });
  it('returns null for invalid time', () => {
    expect(normalizeSlot('25:00', '12:00')).toBeNull();
    expect(normalizeSlot('10:00', 'nope')).toBeNull();
  });
});

describe('slotsOverlap', () => {
  it('adjacent slots do not overlap', () => {
    expect(slotsOverlap({ start: 600, end: 720 }, { start: 720, end: 840 })).toBe(false);
    expect(slotsOverlap({ start: 600, end: 720 }, { start: 540, end: 600 })).toBe(false);
  });
  it('overlapping slots overlap', () => {
    expect(slotsOverlap({ start: 600, end: 720 }, { start: 700, end: 800 })).toBe(true);
    expect(slotsOverlap({ start: 700, end: 800 }, { start: 600, end: 720 })).toBe(true);
  });
  it('night-crossing slots overlap', () => {
    expect(slotsOverlap({ start: 1380, end: 1620 }, { start: 1500, end: 1560 })).toBe(true);
    expect(slotsOverlap({ start: 1380, end: 1440 }, { start: 1440, end: 1560 })).toBe(false);
  });
});

describe('freeWindowsInDay', () => {
  it('empty blocked -> whole working day is free', () => {
    expect(freeWindowsInDay([], 540, 1380)).toEqual([{ start: 540, end: 1380 }]);
  });
  it('single blocked window splits the day', () => {
    expect(freeWindowsInDay([{ start: 600, end: 720 }], 540, 1380)).toEqual([
      { start: 540, end: 600 },
      { start: 720, end: 1380 },
    ]);
  });
  it('merges overlapping blocked windows', () => {
    expect(freeWindowsInDay([{ start: 600, end: 680 }, { start: 650, end: 720 }], 540, 1380)).toEqual([
      { start: 540, end: 600 },
      { start: 720, end: 1380 },
    ]);
  });
  it('clips bookings outside working hours', () => {
    expect(freeWindowsInDay([{ start: 480, end: 1560 }], 540, 1380)).toEqual([]);
  });
  it('returns empty when close <= open', () => {
    expect(freeWindowsInDay([], 600, 600)).toEqual([]);
    expect(freeWindowsInDay([], 720, 540)).toEqual([]);
  });
});

describe('normalizeWorkingHours', () => {
  it('falls back to defaults', () => {
    expect(normalizeWorkingHours(null)).toEqual({ open: 540, close: 1380 });
    expect(normalizeWorkingHours(undefined)).toEqual({ open: 540, close: 1380 });
    expect(normalizeWorkingHours({})).toEqual({ open: 540, close: 1380 });
  });
  it('parses day shift', () => {
    expect(normalizeWorkingHours({ open: '10:00', close: '22:00' })).toEqual({ open: 600, close: 1320 });
  });
  it('handles night shift close past midnight', () => {
    expect(normalizeWorkingHours({ open: '15:00', close: '03:00' })).toEqual({ open: 900, close: 1620 });
  });
  it('handles 00:00 close as full day', () => {
    expect(normalizeWorkingHours({ open: '09:00', close: '00:00' })).toEqual({ open: 540, close: 1440 });
  });
  it('handles 24:00 close as end of day', () => {
    expect(normalizeWorkingHours({ open: '09:00', close: '24:00' })).toEqual({ open: 540, close: 1440 });
  });
  it('falls back on garbage input', () => {
    expect(normalizeWorkingHours({ open: 'xx', close: 'yy' })).toEqual({ open: 540, close: 1380 });
  });
});

describe('slotWithinWorkingHours', () => {
  it('accepts slot inside hours', () => {
    expect(slotWithinWorkingHours({ start: 600, end: 720 }, { open: 540, close: 1380 })).toBe(true);
  });
  it('rejects slot starting before open', () => {
    expect(slotWithinWorkingHours({ start: 360, end: 1440 }, { open: 540, close: 1380 })).toBe(false);
  });
  it('rejects slot ending after close', () => {
    expect(slotWithinWorkingHours({ start: 600, end: 1500 }, { open: 540, close: 1380 })).toBe(false);
  });
  it('accepts night-shift slot within night hours', () => {
    expect(slotWithinWorkingHours({ start: 1380, end: 1500 }, { open: 1380, close: 1620 })).toBe(true);
  });
});

describe('toISODate', () => {
  it('parses plain date', () => {
    const r = toISODate('2026-09-21');
    expect(r).not.toBeNull();
    expect(r!.isoDate).toBe('2026-09-21');
  });
  it('parses full ISO string', () => {
    const r = toISODate('2026-09-21T12:00:00.000Z');
    expect(r!.isoDate).toBe('2026-09-21');
  });
  it('rejects invalid input', () => {
    expect(toISODate('21.09.2026')).toBeNull();
    expect(toISODate('garbage')).toBeNull();
  });
});

describe('Tashkent date helpers', () => {
  it('returns ISO-like date strings', () => {
    expect(tashkentTodayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tashkentDayISO(0)).toBe(tashkentTodayISO());
    expect(tashkentDayISO(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tashkentDayISO(-1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});