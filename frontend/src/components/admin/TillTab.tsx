'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Banknote, Clock, RefreshCw, CreditCard, Receipt } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import { formatPrice, formatDateTime, cn } from '@/lib/utils';

type Debt = {
  id: string;
  amount: number;
  dueAt: string | null;
  createdAt: string;
  status: string;
  settledAt: string | null;
  settledBy: string | null;
  bookingId: string;
  bookingLabel: string;
  user: { id: string; fullName: string; phone: string | null; email: string | null };
};

/** Mijoz to'lov yaratgan, admin tasdig'i kutilayotgan qo'lda to'lov. */
type Pending = {
  id: string;
  amount: number;
  method: 'CASH' | 'TRANSFER' | null;
  status: string;
  createdAt: string;
  proofSubmittedAt: string | null;
  cardLast4: string | null;
  cardholderName: string | null;
  receipts: Array<{ id: string; url: string; mimeType: string }>;
  bookingId: string;
  bookingLabel: string;
  user: { id: string; fullName: string; phone: string | null; email: string | null };
};

/**
 * KASSA — kutilayotgan to'lovlar (naqd / o'tkazma) + qarzlar (overtime).
 *
 * Oqim 1 (kutilmoqda): mijoz to'lov yaratadi -> shu yerda ko'rinadi ->
 *   admin "Kassada to'ladi" bosadi -> to'lov PAID, `settledAt`/`settledBy`
 *   yoziladi, mijozga xabar boradi.
 * Oqim 2 (qarz): sessiya tugagandan keyin yuzaga kelgan overtime qarz ->
 *   mijoz kassada naqd pul beradi -> admin shu tugma bilan yopadi.
 */
export default function TillTab() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean; open?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/payments/debts', {
        params: opts?.open === false ? { open: 0 } : { open: 1 },
      });
      const list = data?.data?.debts;
      setDebts(Array.isArray(list) ? list : []);
      const waitList = data?.data?.pending;
      setPending(Array.isArray(waitList) ? waitList : []);
      setTotal(typeof data?.data?.total === 'number' ? data.data.total : 0);
      setOpenCount(typeof data?.data?.openCount === 'number' ? data.data.openCount : 0);
      setPendingTotal(typeof data?.data?.pendingTotal === 'number' ? data.data.pendingTotal : 0);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load({ open: !showSettled }); }, [load, showSettled]);

  useEffect(() => {
    const onFocus = () => load({ silent: true, open: !showSettled });
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load, showSettled]);

  async function settle(id: string) {
    setBusyId(id);
    try {
      await api.post(`/api/payments/${id}/settle`);
      toastSuccess('Kassada to\'landi deb tasdiqlandi');
      setExpanded((v) => (v === id ? null : v));
      await load({ silent: true, open: !showSettled });
    } catch (err) {
      toastError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="neo-card rounded-2xl p-5 border-neon-amber/40">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Clock size={18} className="text-neon-amber" />
              Tasdiqlash kutilmoqda
              <span className="text-xs font-normal text-gray-400">
                ({pending.length} ta · {formatPrice(pendingTotal)} so'm)
              </span>
            </h3>
            <button
              onClick={() => load({ silent: true, open: !showSettled })}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors"
              aria-label="Yangilash"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Mijoz to'lovni yaratdi, lekin tasdiqlash kutilmoqda. Bank hisobini
            tekshirib (karta oxirgi 4 raqami + ism) yoki naqd kassada qabul qilib
            &quot;Kassada to&apos;ladi&quot;ni bosing — mijoz darhol xabar oladi.
          </p>

          <div className="space-y-2">
            {pending.map((p) => {
              const isTransfer = p.method === 'TRANSFER';
              const open = expanded === p.id;
              return (
                <div key={p.id} className="p-3 rounded-xl border border-neon-amber/30 bg-neon-amber/5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm flex items-center gap-2">
                        {p.user.fullName}
                        {p.user.phone && <span className="text-xs text-gray-400 font-normal">{p.user.phone}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{p.bookingLabel}</p>
                      <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          {isTransfer ? <CreditCard size={11} /> : <Banknote size={11} />}
                          {isTransfer ? 'Karta orqali o&apos;tkazma' : 'Naqd (kassa)'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDateTime(p.proofSubmittedAt || p.createdAt)}
                        </span>
                        {p.cardLast4 && (
                          <span className="font-mono text-gray-300">•••• {p.cardLast4}</span>
                        )}
                        {p.cardholderName && <span className="text-gray-300">{p.cardholderName}</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neon-cyan whitespace-nowrap">{formatPrice(p.amount)}</span>
                      {(p.receipts.length > 0) && (
                        <button
                          onClick={() => setExpanded(open ? null : p.id)}
                          className="text-xs px-2.5 py-2 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors flex items-center gap-1"
                        >
                          <Receipt size={13} />
                          Chek {p.receipts.length}
                        </button>
                      )}
                      <button
                        onClick={() => settle(p.id)}
                        disabled={busyId === p.id}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {busyId === p.id ? 'Tasdiqlanmoqda…' : "Kassada to'ladi"}
                      </button>
                    </div>
                  </div>

                  {open && p.receipts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-cyber-700 flex flex-wrap gap-2">
                      {p.receipts.map((r) =>
                        r.mimeType.startsWith('image/') ? (
                          <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.url}
                              alt="O'tkazma cheki"
                              className="w-24 h-24 object-cover rounded-lg border border-cyber-600 hover:border-neon-cyan transition-colors"
                            />
                          </a>
                        ) : (
                          <a
                            key={r.id}
                            href={r.url}
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
        </div>
      )}

      <div className="neo-card rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-bold flex items-center gap-2">
          <Banknote size={18} className="text-neon-cyan" />
          Kassa — qarzlar
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {showSettled ? 'Jami' : 'To\'lanmagan'}:{' '}
            <b className="text-neon-cyan">{formatPrice(total)}</b>
            {!showSettled && openCount > 0 && (
              <span className="text-gray-500"> ({openCount} ta)</span>
            )}
          </span>
          <button
            onClick={() => setShowSettled((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors"
          >
            {showSettled ? 'Faqat to\'lanmaganlar' : 'Barchasi (tarixi)'}
          </button>
          <button
            onClick={() => load({ open: !showSettled })}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors"
            aria-label="Yangilash"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-cyber-800 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle size={36} className="mx-auto mb-3 text-red-400" />
          <p className="text-sm text-gray-300">{error}</p>
        </div>
      ) : debts.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-neon-green" />
          <p className="text-sm text-gray-300 font-medium">
            {showSettled ? 'Hali to\'langan qarz yo\'q' : 'To\'lanmagan qarz yo\'q — hammasi to\'langan'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {debts.map((d) => {
            const overdue = !d.settledAt && d.dueAt && new Date(d.dueAt).getTime() < Date.now();
            return (
              <div
                key={d.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border',
                  d.settledAt ? 'border-cyber-700 bg-cyber-800/40' : 'border-neon-cyan/30 bg-neon-cyan/5',
                )}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-2">
                    {d.user.fullName}
                    {d.user.phone && <span className="text-xs text-gray-400 font-normal">{d.user.phone}</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{d.bookingLabel}</p>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    To'lov muddati: {d.dueAt ? formatDateTime(d.dueAt) : 'belgilanmagan'}
                    {overdue && <span className="text-red-400 font-semibold"> — muddati o'tdi</span>}
                    {d.settledAt && (
                      <span className="text-neon-green"> — to&apos;landi {formatDateTime(d.settledAt)}{d.settledBy ? ` (${d.settledBy})` : ''}</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-bold text-neon-cyan whitespace-nowrap">{formatPrice(d.amount)}</span>
                  {!d.settledAt && (
                    <button
                      onClick={() => settle(d.id)}
                      disabled={busyId === d.id}
                      className="text-xs font-bold px-3 py-2 rounded-lg bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25 transition-colors disabled:opacity-50"
                    >
                      {busyId === d.id ? 'Tasdiqlanmoqda…' : "Kassada to'ladi"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
