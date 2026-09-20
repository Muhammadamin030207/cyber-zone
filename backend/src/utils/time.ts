// Biznes vaqti — Asia/Tashkent. Barcha sana/vaqt hisoblari shu zona bo'yicha.
export const BUSINESS_TZ = 'Asia/Tashkent';

function tzParts(date: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, ...opts }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

/** Toshkent vaqti bo'yicha bugungi "YYYY-MM-DD" (ISO date). */
export function tashkentTodayISO(): string {
  const p = tzParts(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Toshkent vaqti bo'yicha hozirgi "HH:mm". */
export function tashkentNowHHMM(): string {
  const p = tzParts(new Date(), { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${p.hour}:${p.minute}`;
}

/** Toshkent vaqti bo'yicha sanaga kun qo'shish: "YYYY-MM-DD". */
export function tashkentDayISO(offsetDays = 0): string {
  const today = tashkentTodayISO();
  if (offsetDays === 0) return today;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** "HH:mm" -> kun boshidan daqiqa (0..1439). Noto'g'ri bo'lsa null. */
export function parseTime(t: unknown): number | null {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface SlotNorm {
  start: number; // daqiqalar (0..)
  end: number;   // start dan katta, 1440 dan oshishi mumkin (tunga oshgan davr)
}

/**
 * "HH:mm" ish vaqti davrini normalizatsiya qiladi.
 * - end "00:00" -> 1440 (kun oxiri)
 * - end <= start -> end +1440 tunga oshgan davr (masalan 23:00 - 01:00 => [1380, 1500])
 */
export function normalizeSlot(startStr: string, endStr: string): SlotNorm | null {
  const start = parseTime(startStr);
  let end = parseTime(endStr);
  if (start === null || end === null) return null;
  if (end === 0) end = 1440;
  if (end <= start) end += 1440;
  return { start, end };
}

/** Ikki davr kesishadimi: A.start < B.end && A.end > B.start */
export function slotsOverlap(a: SlotNorm, b: SlotNorm): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Berilgan band vaqtlar orasidagi BO'SH vaqt oynalarini qaytaradi.
 * Ish vaqti [open, close] (close 1440 dan oshishi mumkin — tungi smena) ichida.
 * Kiruvchi bandlar ish vaqtiga qirqiladi, kesishganlari birlashtiriladi.
 */
export function freeWindowsInDay(
  blocked: SlotNorm[],
  open: number,
  close: number
): Array<{ start: number; end: number }> {
  if (close <= open) return [];
  const min = (v: number) => Math.max(open, Math.min(close, v));
  const clipped: Array<{ start: number; end: number }> = [];
  for (const b of blocked) {
    const s = min(b.start);
    const e2 = min(b.end);
    if (e2 > s) clipped.push({ start: s, end: e2 });
  }
  clipped.sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const c of clipped) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end) {
      if (c.end > last.end) last.end = c.end;
    } else {
      merged.push({ start: c.start, end: c.end });
    }
  }

  const free: Array<{ start: number; end: number }> = [];
  let cursor = open;
  for (const m of merged) {
    if (m.start > cursor) free.push({ start: cursor, end: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (cursor < close) free.push({ start: cursor, end: close });
  return free;
}

export interface WorkingHoursNorm {
  open: number;
  close: number; // 1440 dan oshishi mumkin (tungi ish: 15:00 - 03:00 => close 1620)
}

export interface WorkingHoursLike {
  open?: unknown;
  close?: unknown;
}

const DEFAULT_WH = { open: '09:00', close: '23:00' };

export function normalizeWorkingHours(wh: WorkingHoursLike | null | undefined): WorkingHoursNorm {
  const fallback = (v: unknown, def: string): string =>
    v === undefined || v === null || v === '' ? def : String(v);
  const open = parseTime(fallback(wh?.open, DEFAULT_WH.open));
  let close = parseTime(fallback(wh?.close, DEFAULT_WH.close));
  if (open === null || close === null) return { open: 540, close: 1380 };
  if (close === 0) close = 1440;
  if (close < open) close += 1440;
  return { open, close };
}

export function slotWithinWorkingHours(slot: SlotNorm, wh: WorkingHoursNorm): boolean {
  return slot.start >= wh.open && slot.end <= wh.close;
}

/** "YYYY-MM-DD" (yoki ISO) stringdan barkamol ISO date va Toshkent date key chiqaradi. */
export function toISODate(dateStr: string): { isoDate: string; date: Date } | null {
  const isoDate = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (isNaN(date.getTime())) return null;
  return { isoDate, date };
}