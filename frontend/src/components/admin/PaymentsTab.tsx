'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Search,
  RefreshCw,
  CreditCard,
  Banknote,
  Receipt,
  Monitor,
  User,
  CalendarDays,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import { formatPrice, formatDateTime, cn } from '@/lib/utils';

type PaymentRow = {
  id: string;
  amount: number;
  type: string;
  method: string | null;
  provider: string | null;
  status: string;
  receiptNumber: string | null;
  depositPercent: number | null;
  proofCardLast4: string | null;
  proofCardholderName: string | null;
  proofSubmittedAt: string | null;
  failureReason: string | null;
  isDebt: boolean;
  createdAt: string;
  evidences: Array<{ id: string; fileUrl: string; mimeType: string }>;
  booking: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    finalPrice: number;
    depositPercent: number;
    advanceAmount: number;
    remainingAmount: number;
    status: string;
    approvalStatus: string;
    room: { name: string };
    zone: { name: string };
    computer: { name: string } | null;
  };
  user: { id: string; fullName: string; email: string | null; phone: string | null };
};

const METHOD_LABEL: Record<string, string> = {
  UZUM: 'Uzum',
  PAYME: 'Payme',
  CLICK: 'Click',
  PAYNET: 'Paynet',
  UZCARD: 'UzCard',
  HUMO: 'Humo',
  VISA: 'Visa',
  CASH: 'Naqd',
  TRANSFER: 'O\'tkazma',
};

const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Yaratilgan',
  PENDING: 'Kutilmoqda',
  REDIRECT_REQUIRED: 'Qayta yo\'naltirish',
  PROCESSING: 'Jarayonda',
  PAID: 'To\'langan',
  COMPLETED: 'Yakunlangan',
  FAILED: 'Muvaffaqiyatsiz',
  CANCELLED: 'Bekor',
  EXPIRED: 'Muddati o\'tgan',
  REFUNDED: 'Qaytarilgan',
  REJECTED: 'Rad etilgan',
};

/**
 * TO'LOVLAR — chek raqami (yoki ism/telefon/email) bo'yicha qidiruv.
 *
 * Mijoz qo'ng'iroq qilib chek raqamini aytadi -> admin shu yerga yozadi ->
 * to'lov, mijoz (ism/telefon), xona/kompyuter, summa, depozit %, qoldiq,
 * usul, chek skrinshoti, holat ko'rinadi -> "Tasdiqlash" tugmasi bilan
 * to'lov PAID bo'lib bron tasdiqlanadi (mijoz sessiyani boshlay oladi).
 */
export default function PaymentsTab() {
  const [q, setQ] = useState('');
  const [receipt, setReceipt] = useState('');
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit: 50 };
      const rec = receipt.trim();
      if (rec) params.receiptNumber = rec;
      const term = q.trim();
      if (term) params.q = term;
      const { data } = await api.get('/api/payments', { params });
      const list = data?.data?.payments;
      setRows(Array.isArray(list) ? list : []);
      setTotal(typeof data?.data?.total === 'number' ? data.data.total : 0);
      setRevenue(typeof data?.data?.revenue === 'number' ? data.data.revenue : 0);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [q, receipt]);

  // Debounce'li qidiruv: har bir belgi uchun so'rov jo'natmaydi.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void load(true); }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await api.post(`/api/payments/${id}/confirm`);
      toastSuccess('To\'lov tasdiqlandi — bron yakunlandi');
      setExpanded((v) => (v === id ? null : v));
      await load(true);
    } catch (err) {
      toastError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt('Rad etish sababini kiriting (kamida 3 belgi):');
    if (!reason || reason.trim().length < 3) return;
    setBusyId(id);
    try {
      await api.post(`/api/payments/${id}/reject`, { reason: reason.trim() });
      toastSuccess('To\'lov rad etildi — mijoz qayta chek yuklay oladi');
      setExpanded((v) => (v === id ? null : v));
      await load(true);
    } catch (err) {
      toastError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const isEmpty = !loading && !error && rows.length === 0;

  return (
    <div className="space-y-4">
      {/* Qidiruv */}
      <div className="neo-card rounded-2xl p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Chek raqami, ism, email yoki telefon…"
                aria-label="To'lov qidirish"
                className="glass-input w-full rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none"
              />
            </div>
            <input
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void load(); }}
              placeholder="CZ-……"
              aria-label="Aniq chek raqami"
              className="glass-input w-full sm:w-48 rounded-xl px-3 py-2.5 text-sm font-mono outline-none uppercase"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan text-sm font-bold hover:bg-neon-cyan/20 transition-colors disabled:opacity-50"
            >
              {loading ? 'Qidirilmoqda…' : 'Qidirish'}
            </button>
            <button
              onClick={() => void load(true)}
              className="px-3 py-2.5 rounded-xl border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors"
              aria-label="Yangilash"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">
          Jami topildi: <b className="text-gray-300">{total}</b> · Tasdiqlangan tushum: <b className="text-neon-green">{formatPrice(revenue)} so&apos;m</b>
        </p>
      </div>

      {loading && !error ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-cyber-800 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="text-center py-12 neo-card rounded-2xl">
          <AlertCircle size={36} className="mx-auto mb-3 text-red-400" />
          <p className="text-sm text-gray-300">{error}</p>
        </div>
      ) : isEmpty ? (
        <div className="text-center py-12 neo-card rounded-2xl">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-neon-green" />
          <p className="text-sm text-gray-300 font-medium">To&apos;lov topilmadi. Chek raqamini yoki ism/telefonni tekshiring.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => {
            const open = expanded === p.id;
            const canConfirm = ['PENDING', 'CREATED', 'PROCESSING'].includes(p.status);
            // Rad etish — faqat chek yuborilgan (TRANSFER) kutilayotgan to'lov uchun.
            const canReject = p.status === 'PENDING' && p.proofSubmittedAt != null && p.evidences.length > 0;
            return (
              <div key={p.id} className={cn('neo-card rounded-2xl p-4', p.isDebt && 'border-neon-amber/40')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="font-bold text-sm flex items-center gap-1.5">
                        <User size={14} className="text-neon-cyan" />
                        {p.user.fullName}
                        {p.user.phone && <span className="text-xs font-normal text-gray-400">{p.user.phone}</span>}
                      </p>
                      {p.receiptNumber && (
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan">
                          <Receipt size={11} className="inline mr-1 align-[-1px]" />
                          {p.receiptNumber}
                        </span>
                      )}
                      <span
                        className={cn(
                          'text-[11px] px-2 py-0.5 rounded-full border font-semibold',
                          p.status === 'PAID' || p.status === 'COMPLETED'
                            ? 'border-neon-green/40 bg-neon-green/10 text-neon-green'
                            : p.status === 'FAILED' || p.status === 'EXPIRED' || p.status === 'CANCELLED' || p.status === 'REJECTED'
                              ? 'border-red-400/40 bg-red-400/10 text-red-300'
                              : 'border-neon-amber/40 bg-neon-amber/10 text-neon-amber'
                        )}
                      >
                        {STATUS_LABEL[p.status] || p.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <Monitor size={11} />
                        {p.booking.room?.name} · {p.booking.zone?.name}
                        {p.booking.computer?.name ? ` · ${p.booking.computer.name}` : ` · ${p.booking.computer?.name ?? ''}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {p.booking.date} {p.booking.startTime}—{p.booking.endTime}
                      </span>
                      <span className="flex items-center gap-1">
                        {p.method === 'CASH' ? <Banknote size={11} /> : <CreditCard size={11} />}
                        {METHOD_LABEL[(p.method || p.provider) ?? ''] || p.method || p.provider || '—'}
                      </span>
                      <span className="text-gray-500">{formatDateTime(p.createdAt)}</span>
                    </p>
                    {p.proofCardLast4 && (
                      <p className="text-xs text-gray-400 mt-1">
                        Karta: <span className="font-mono text-gray-300">•••• {p.proofCardLast4}</span>
                        {p.proofCardholderName && <span className="ml-2">{p.proofCardholderName}</span>}
                        {p.proofSubmittedAt && <span className="text-gray-500"> · {formatDateTime(p.proofSubmittedAt)}</span>}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-neon-cyan whitespace-nowrap">{formatPrice(p.amount)} so&apos;m</p>
                      <p className="text-[11px] text-gray-500 whitespace-nowrap">
                        {p.booking.depositPercent}% depozit · qoldiq {formatPrice(p.booking.remainingAmount)}
                      </p>
                    </div>
                    {p.evidences.length > 0 && (
                      <button
                        onClick={() => setExpanded(open ? null : p.id)}
                        className="text-xs px-2.5 py-2 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors flex items-center gap-1"
                      >
                        <Receipt size={13} />
                        Chek
                      </button>
                    )}
                    {p.status === 'REJECTED' && p.failureReason && (
                      <p className="text-xs text-red-300 mt-1">
                        Rad etish sababi: <span className="text-red-200">{p.failureReason}</span>
                      </p>
                    )}
                    {canConfirm && (
                      <button
                        onClick={() => void confirm(p.id)}
                        disabled={busyId === p.id}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {busyId === p.id ? 'Tasdiqlanmoqda…' : 'Tasdiqlash'}
                      </button>
                    )}
                    {canReject && (
                      <button
                        onClick={() => void reject(p.id)}
                        disabled={busyId === p.id}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        Rad etish
                      </button>
                    )}
                  </div>
                </div>

                {open && p.evidences.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-cyber-700 flex flex-wrap gap-2">
                    {p.evidences.map((r) =>
                      r.mimeType?.startsWith('image/') ? (
                        <a key={r.id} href={r.fileUrl} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.fileUrl}
                            alt="O'tkazma cheki"
                            className="w-48 h-48 object-cover rounded-lg border border-cyber-600 hover:border-neon-cyan transition-colors"
                          />
                        </a>
                      ) : (
                        <a
                          key={r.id}
                          href={r.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-2 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors"
                        >
                          Chekni ochish
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}