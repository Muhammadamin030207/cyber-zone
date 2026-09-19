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
import Logo from '@/components/brand/Logo';

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

  const totalPaidAll = bookings.reduce(
    (acc, b) => acc + (b.payments || []).filter((p) => p.status === 'COMPLETED').reduce((a, p) => a + Number(p.amount), 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl neo-card flex items-center justify-center shadow-glow">
            <span className="avatar" style={{ width: '2.75rem', height: '2.75rem', fontSize: '1.1rem' }}>
              {(user?.fullName || 'U')[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{t('title')}</h1>
            <p className="text-gray-400 mt-0.5">{user?.fullName} · {user?.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-6">
          {[
            {
              icon: CalendarDays,
              value: activeBookings.length,
              label: t('upcoming'),
              color: 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/10',
            },
            {
              icon: Wallet,
              value: `${formatPrice(totalPaidAll)}`,
              label: 'To\'langan',
              color: 'text-neon-green border-neon-green/30 bg-neon-green/10',
            },
            {
              icon: Ticket,
              value: bookings.length,
              label: t('history'),
              color: 'text-neon-magenta border-neon-magenta/30 bg-neon-magenta/10',
            },
          ].map((s) => (
            <div key={s.label} className="neo-card rounded-2xl p-4 flex items-center gap-3">
              <span className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${s.color}`}>
                <s.icon size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-xl font-bold truncate">{s.value}</div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wider">{s.label}</div>
              </div>
            </div>
          ))}
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
            <div key={i} className="skeleton rounded-2xl h-52" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-20 neo-card rounded-2xl">
          <div className="w-16 h-16 mx-auto mb-4 neo-card rounded-2xl flex items-center justify-center animate-floaty">
            <Logo size={38} />
          </div>
          <p className="text-gray-400 text-lg">{t('noBookings')}</p>
          <Link href="/rooms" className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 rounded-xl neon-btn text-sm font-bold">
            <Monitor size={16} /> Xonalar
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {shown.map((b) => {
            const paidPayments = (b.payments || []).filter((p) => p.status === 'COMPLETED');
            const totalPaid = paidPayments.reduce((a, p) => a + Number(p.amount), 0);
            const remainingDue = Math.max(0, Number(b.finalPrice) - totalPaid);
            return (
              <div key={b.id} className="neo-card card-hover rounded-2xl p-5 relative overflow-hidden">
                <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${
                  b.status === 'CANCELLED' ? 'bg-red-500/60' : b.status === 'COMPLETED' ? 'bg-gray-500/50' : b.status === 'ACTIVE' ? 'bg-neon-green' : b.status === 'CONFIRMED' ? 'bg-neon-cyan' : 'bg-yellow-500'
                }`} />
                <div className="flex items-start justify-between mb-3 pl-2">
                  <div>
                    <h3 className="font-bold text-lg">{b.room?.name || 'Xona'}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={11} /> {b.room?.address || ''}{' '}
                      <span className="text-gray-600">· {b.zone?.name}</span>
                    </p>
                  </div>
                  <span className={cn('px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1', STATUS_STYLE[b.status])}>
                    {b.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />}
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