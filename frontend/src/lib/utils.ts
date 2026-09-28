/** Nolni ajratish uchun noqilavors (U+00A0) — `Intl` bilan bir xil ko'rinadi. */
const GROUP_SEP = '\u00A0';
/** O'nlik ajratgichi — O'zbekistonda nuqta emas, vergul ishlatiladi. */
const DECIMAL_SEP = ',';

/**
 * Summani qo'lda guruhlaydi, `Intl` ishlatmasdan.
 *
 * Sabab: `toLocaleString('uz-UZ')` ICU qurilmasiga bog'liq — serverda `small-icu`
 * bo'lsa `1,234,567.89`, brauzerda `1 234 567,89` qaytaradi va bu SSR/klient
 * gidratsiyasini buzadi. Qo'lda formatlash har qanday muhitda bir xil natija beradi.
 * */
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEP);
}

/** Kasr sonlarni `uz-UZ` uslubida chiqaradi (vergul bilan, 0 dan 2 xona). */
export function formatPrice(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '0';
  const raw = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(raw)) return '0';

  const negative = raw < 0;
  const fixed = Math.abs(raw).toFixed(2);
  const [intPart, fracPart] = fixed.split('.');
  // Nol kasrlari ko'rsatilmaydi (50 000,00 emas balki 50 000).
  const frac = fracPart.replace(/0+$/, '');

  const body = groupThousands(intPart) + (frac ? DECIMAL_SEP + frac : '');
  return negative ? `\u2212${body}` : body;
}

export function formatPriceShort(value: number | string | undefined | null): string {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mln`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return formatPrice(n);
}

function toDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return '—';
  return d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return '—';
  return d.toLocaleString('uz-UZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const BUSINESS_TZ = 'Asia/Tashkent';

function tzPartFor(part: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  return parts.find((p) => p.type === part)?.value || '';
}

export function todayISO(): string {
  return `${tzPartFor('year')}-${tzPartFor('month')}-${tzPartFor('day')}`;
}

export function addDaysISO(days: number): string {
  if (days === 0) return todayISO();
  const d = new Date(`${todayISO()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Toshkent vaqti bo'yicha hozirgi "HH:mm". */
export function businessNowHHMM(): string {
  return `${String(tzPartFor('hour')).padStart(2, '0')}:${String(tzPartFor('minute')).padStart(2, '0')}`;
}

export function zoneTypeLabel(type: string): string {
  const map: Record<string, string> = {
    GENERAL_HALL: 'Umumiy zal',
    VIP: 'VIP',
    CABIN: 'Kabina',
  };
  return map[type] || type;
}

export function toNumber(v: unknown): number {
  if (typeof v === 'string') return parseFloat(v);
  // Prisma `Decimal` va boshqa value ob'ektlari: `String()` ularning
  // `toString()`'ini chaqiradi ("15000.00" -> 15000).
  if (typeof v === 'object' && v !== null) return Number(String(v));
  return Number(v || 0);
}

/**
 * Hozirgi vaqt (ms).
 *
 * Nima uchun yordamchi funksiya: React Compiler `Date.now()` ni render
 * paytida "impure" deb hisoblaydi. Bu funksiya **faqat hodisa
 * ishlovchilarida** (submit, interval) chaqiriladi — render toqalunmaydi.
 */
export function nowMs(): number {
  return Date.now();
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Idempotency kaliti (bron/to'lov). Render paytida emas, **hodisa
 * ishlovchisi** ichida chaqiriladi — `Date.now()`/`Math.random()` render
 * davomida noto'g'ri (qayta renderda qiymat o'zgaradi).
 */
export function newIdempotencyKey(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${rand}`;
}

export function mergeChatMessages<T extends { id: string; createdAt: string }>(
  existing: T[],
  incoming: T[] | T
): T[] {
  const map = new Map<string, T>();
  for (const m of existing) map.set(m.id, m);
  const arr = Array.isArray(incoming) ? incoming : [incoming];
  for (const m of arr) if (m && m.id) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}