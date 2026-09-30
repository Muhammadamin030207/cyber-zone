'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Wallet, Loader2, Receipt, AlertTriangle, ChevronRight } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface PaymentRow {
  id: string;
  amount: number;
  type: string;
  method: string;
  status: string;
  createdAt: string;
  isDebt?: boolean;
  dueAt?: string | null;
  booking?: { id: string; date?: string; startTime?: string; sessionType?: string; room?: { name: string } } | null;
}

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: 'text-neon-green bg-neon-green/10 border-neon-green/25',
  CONFIRMED: 'text-neon-green bg-neon-green/10 border-neon-green/25',
  PAID: 'text-neon-green bg-neon-green/10 border-neon-green/25',
  PENDING: 'text-yellow-300 bg-yellow-400/10 border-yellow-400/25',
  PROCESSING: 'text-yellow-300 bg-yellow-400/10 border-yellow-400/25',
  CREATED: 'text-yellow-300 bg-yellow-400/10 border-yellow-400/25',
  FAILED: 'text-red-300 bg-red-500/10 border-red-500/25',
  REJECTED: 'text-red-300 bg-red-500/10 border-red-500/25',
  CANCELLED: 'text-gray-400 bg-white/5 border-white/10',
  REFUNDED: 'text-neon-cyan bg-neon-cyan/10 border-neon-cyan/25',
};

const TYPE_STYLE: Record<string, string> = {
  DEPOSIT: 'text-neon-cyan',
  REMAINING: 'text-amber-300',
  BAR: 'text-neon-magenta',
  FINE: 'text-red-300',
};

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Number(n) || 0);
const dt = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }).format(d);
};

export default function PaymentsPage() {
  const t = useTranslations('payments');
  const user = useAuthStore((s) => s.user);

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/payments/history', { params: { limit, offset } });
      setRows(data.payments || []);
      setTotal(Number(data.total) || 0);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [limit, offset, t]);

  useEffect(() => {
    if (user) void load();
    else setLoading(false);
  }, [user, load]);

  const debtTotal = rows.filter((r) => r.isDebt && r.status === 'PENDING').reduce((s, r) => s + Number(r.amount), 0);
  const paidTotal = rows
    .filter((r) => !r.isDebt && ['COMPLETED', 'CONFIRMED', 'PAID'].includes(r.status))
    .reduce((s, r) => s + Number(r.amount), 0);

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-2 text-sm text-gray-400">{t('authRequired')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Wallet className="text-neon-cyan" size={24} aria-hidden />
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-gray-400">{t('subtitle')}</p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-neon-green/25 bg-neon-green/5 px-4 py-3.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">{t('paidTotal')}</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-neon-green">{fmt(paidTotal)}</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3.5 ${debtTotal > 0 ? 'border-amber-500/35 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">{t('debtTotal')}</p>
          <p className={`mt-1 font-mono text-xl font-extrabold ${debtTotal > 0 ? 'text-amber-300' : 'text-gray-300'}`}>
            {fmt(debtTotal)}
          </p>
        </div>
      </div>

      {debtTotal > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {t('debtHint')}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2.5 py-16 text-sm text-gray-400">
          <Loader2 size={18} className="animate-spin" aria-hidden />
          {t('loading')}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">{error}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-14 text-center">
          <Receipt size={24} className="mx-auto mb-3 text-gray-600" aria-hidden />
          <p className="text-sm font-semibold text-gray-300">{t('empty')}</p>
          <Link href={`/${t('locale')}/rooms`} className="mt-4 inline-block rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-gray-200 hover:bg-white/5">
            {t('browseRooms')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[r.status] || 'border-white/10 bg-white/5 text-gray-400'}`}>
                    {r.status}
                  </span>
                  <span className={`text-[10px] font-bold uppercase ${TYPE_STYLE[r.type] || 'text-gray-400'}`}>{r.type}</span>
                  <span className="text-[10px] uppercase text-gray-500">{r.method}</span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-400">
                  {dt(r.createdAt)}
                  {r.booking?.room?.name ? ` · ${r.booking.room.name}` : ''}
                  {r.booking?.date ? ` · ${String(r.booking.date).slice(0, 10)}` : ''}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-extrabold text-gray-100">{fmt(r.amount)}</span>
              {r.booking?.id && (
                <Link
                  href={`/${t('locale')}/dashboard?booked=${r.booking.id}`}
                  aria-label={t('openBooking')}
                  className="shrink-0 text-gray-500 hover:text-neon-cyan"
                >
                  <ChevronRight size={16} aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > limit && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0 || loading}
            className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-40"
          >
            {t('prev')}
          </button>
          <span className="font-mono text-[11px] text-gray-500">
            {offset + 1}–{Math.min(offset + limit, total)} / {total}
          </span>
          <button
            type="button"
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total || loading}
            className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-40"
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
