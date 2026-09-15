export function formatPrice(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '0';
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(n)) return '0';
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
}

export function formatPriceShort(value: number | string | undefined | null): string {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
  if (isNaN(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mln`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return `${n}`;
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString('uz-UZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function zoneTypeLabel(type: string): string {
  const map: Record<string, string> = {
    GENERAL_HALL: 'Umumiy zal',
    VIP: 'VIP',
    CABIN: 'Kabina',
  };
  return map[type] || type;
}

export function toNumber(v: any): number {
  if (typeof v === 'string') return parseFloat(v);
  if (typeof v === 'object' && v !== null && 'toString' in v) return Number(v.toString());
  return Number(v || 0);
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}