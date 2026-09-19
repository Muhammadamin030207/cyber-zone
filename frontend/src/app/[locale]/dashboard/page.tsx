'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  CalendarDays, Clock, MapPin, Loader2, CheckCircle2, XCircle, AlertCircle,
  Wallet, BadgePercent, Monitor, CreditCard, Ticket,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Booking } from '@/lib/types';
import { formatPrice, formatDate, formatDateTime, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  CONFIRMED: 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/30',
  ACTIVE: 'bg-neon-green/15 text-neon-green border-neon-green/30',
  COMPLETED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export default function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('dashboard');
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const bookedId = searchParams.get('booked');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/bookings');
      setBookings(data.data || []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchBookings();
  }, [user, fetchBookings]);

  async function cancelBooking(id: string) {
    setCancelling(id);
    try {
      await api.put(`/api/bookings/${id}/cancel`);
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'CANCELLED' } : b)));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Bekor qilishda xatolik'));
    } finally {
      setCancelling(null);
    }
  }

  const isActiveStatus = (s: string) => ['PENDING', 'CONFIRMED', 'ACTIVE'].includes(s);
  const activeBookings = bookings.filter((b) => isActiveStatus(b.status));
  const historyBookings = bookings.filter((b) => !isActiveStatus(b.status));
  const shown = tab === 'active' ? activeBookings : historyBookings;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('title')}</h1>
          <p className="text-gray-400 mt-1">
            {user?.fullName} · {user?.email}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="neo-card rounded-xl px-4 py-2.5 text-neon-cyan">
            <Wallet size={14} className="inline mr-1" />
            {activeBookings.length} {t('upcoming')}
          </div>
          <div className="neo-card rounded-xl px-4 py-2.5 text-gray-400">
            {bookings.length} {t('myBookings')}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {bookedId && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-sm text-neon-green">
          <CheckCircle2 size={16} /> {t('bookingStatus.CONFIRMED')}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6">
        {(['active', 'history'] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === tabKey ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30' : 'text-gray-400 hover:text-white'
            )}
          >
            {tabKey === 'active' ? t('upcoming') : t('history')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="neo-card rounded-2xl h-52 animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-20">
          <CalendarDays size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400">{t('noBookings')}</p>
          {tab === 'history' && activeBookings.length === 0 && (
            <p className="text-sm text-gray-600 mt-1">{bookings.length === 0 ? t('history') : ''}</p>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {shown.map((b) => {
            const paidPayments = (b.payments || []).filter((p) => p.status === 'COMPLETED');
            const totalPaid = paidPayments.reduce((a, p) => a + Number(p.amount), 0);
            const remainingDue = Math.max(0, Number(b.finalPrice) - totalPaid);
            return (
              <div key={b.id} className="neo-card rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{b.room?.name || 'Xona'}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={11} /> {b.room?.address || ''}{' '}
                      <span className="text-gray-600">· {b.zone?.name}</span>
                    </p>
                  </div>
                  <span className={cn('px-2.5 py-1 text-xs font-bold rounded-lg border', STATUS_STYLE[b.status])}>
                    {t(`bookingStatus.${b.status}`)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <div className="rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2 text-gray-300">
                    <span className="text-xs text-gray-500 flex items-center gap-1"><CalendarDays size={11} /> Sana</span>
                    {formatDate(b.date)}
                  </div>
                  <div className="rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2 text-gray-300">
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} /> Vaqt</span>
                    {b.startTime} — {b.endTime} ({b.durationHours} soat)
                  </div>
                  <div className="rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2 text-gray-300">
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Monitor size={11} /> Kompyuter</span>
                    {b.computer?.name || 'Avto'}
                  </div>
                  <div className="rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2 text-gray-300">
                    <span className="text-xs text-gray-500 flex items-center gap-1"><BadgePercent size={11} /> Chegirma</span>
                    {Number(b.discountAmount) > 0 ? `-${formatPrice(b.discountAmount)} so'm` : '—'}
                  </div>
                </div>

                <div className="h-px bg-neon-cyan/10 my-1" />

                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-500">Jami: </span>
                    <b className="text-neon-cyan">{formatPrice(b.finalPrice)} so'm</b>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <p className="flex items-center gap-1 justify-end">
                      <CreditCard size={11} /> To'langan: {formatPrice(totalPaid)}
                    </p>
                    {remainingDue > 0 && <p>Qolgan: {formatPrice(remainingDue)}</p>}
                    {remainingDue <= 0.004 && b.status !== 'CANCELLED' && (
                      <p className="text-emerald-400 flex items-center gap-1 justify-end mt-0.5">
                        <CheckCircle2 size={11} /> To'liq to'langan
                      </p>
                    )}
                  </div>
                </div>

                {['PENDING', 'CONFIRMED'].includes(b.status) && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {b.status === 'PENDING' && (
                      <Link
                        href={`/checkout/${b.id}`}
                        className="py-2.5 rounded-xl neon-btn flex items-center justify-center gap-2 text-sm font-bold"
                      >
                        <Wallet size={14} />
                        {t('payNow')}
                      </Link>
                    )}
                    {b.status === 'CONFIRMED' && (
                      <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neon-cyan/30 text-neon-cyan text-sm font-medium">
                        <Wallet size={14} /> 30% to'landi
                      </div>
                    )}
                    <button
                      onClick={() => cancelBooking(b.id)}
                      disabled={cancelling === b.id}
                      className="py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {cancelling === b.id ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                      Bekor qilish
                    </button>
                  </div>
                )}

                {['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(b.status) && (
                  <Link
                    href={`/checkout/${b.id}`}
                    className="mt-3 w-full py-2.5 rounded-xl border border-neon-cyan/25 text-neon-cyan text-sm font-medium hover:bg-neon-cyan/10 flex items-center justify-center gap-2"
                  >
                    <Ticket size={15} /> QR Chipta
                  </Link>
                )}

                <p className="text-[11px] text-gray-600 mt-3">Yaratilgan: {formatDateTime(b.createdAt)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}