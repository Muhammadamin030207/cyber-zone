'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CalendarDays, Clock, Monitor, BadgePercent, Check, Loader2, Ticket, LogIn, Zap,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room, AvailabilityZone } from '@/lib/types';
import { formatPrice, formatDate, toNumber, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

interface Props {
  room: Room;
  date: string;
  onDateChange: (date: string) => void;
  availability: AvailabilityZone[];
}

interface PromoCheck {
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
}

export default function BookingWidget({ room, date, onDateChange, availability }: Props) {
  const t = useTranslations('booking');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [zoneId, setZoneId] = useState('');
  const [computerId, setComputerId] = useState('');
  const [autoPc, setAutoPc] = useState(true);
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('18:00');
  const [promoCode, setPromoCode] = useState('');
  const [promo, setPromo] = useState<PromoCheck | null>(null);
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedZone = availability.find((z) => z.id === zoneId) || availability[0];

  useEffect(() => {
    if (availability.length && !zoneId) {
      setZoneId(availability[0].id);
    }
  }, [availability, zoneId]);

  const pricePerHour = selectedZone ? toNumber(selectedZone.pricePerHour) : 0;

  const durationHours = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return Math.max(0, eh + em / 60 - (sh + sm / 60));
  }, [startTime, endTime]);

  const baseTotal = pricePerHour * durationHours;

  const discount = useMemo(() => {
    if (!promo || !promoApplied) return 0;
    const raw = promo.discountType === 'PERCENTAGE' ? (baseTotal * promo.discountValue) / 100 : promo.discountValue;
    return Math.min(raw, baseTotal);
  }, [promo, promoApplied, baseTotal]);

  const finalTotal = Math.max(0, baseTotal - discount);
  const advance = parseInt(String(finalTotal * 0.3));
  const remaining = Math.max(0, finalTotal - advance);

  function checkPromo() {
    if (!promoCode.trim()) {
      setPromoError('Promo-kod kiriting');
      return;
    }
    setPromoLoading(true);
    setPromoError(null);
    api
      .get(`/api/promo/check?code=${encodeURIComponent(promoCode)}&room_id=${room.id}`)
      .then(({ data }) => {
        setPromo({ discountType: data.data.discountType, discountValue: Number(data.data.discountValue) });
        setPromoApplied(true);
      })
      .catch((err) => {
        setPromo(null);
        setPromoApplied(false);
        setPromoError(getApiErrorMessage(err, 'Promo-kod noto\u2019g\u2019ri'));
      })
      .finally(() => setPromoLoading(false));
  }

  function removePromo() {
    setPromo(null);
    setPromoApplied(false);
    setPromoCode('');
  }

  async function submit() {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/rooms/${room.id}`)}`);
      return;
    }
    if (!zoneId || durationHours <= 0) {
      setError(t('notAvailable'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        roomId: room.id,
        zoneId,
        date,
        startTime,
        endTime,
        durationHours,
      };
      if (!autoPc && computerId) payload.computerId = computerId;
      if (promoApplied && promoCode) payload.promoCode = promoCode;

      const { data } = await api.post('/api/bookings', payload);
      const bookingId = data.data?.id;
      router.push(bookingId ? `/dashboard?booked=${bookingId}` : '/dashboard');
      setSuccess(true);
    } catch (err) {
      const msg = getApiErrorMessage(err, t('notAvailable'));
      if (/CONFLICT_/.test(msg)) {
        setError('Tanlangan vaqt band. Boshqa vaqtni tanlang.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-neon-cyan/10 via-transparent to-neon-magenta/10 border-b border-neon-cyan/15 px-5 py-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Zap size={18} className="text-neon-cyan" /> {t('title')}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {t('perHour')} {formatPrice(pricePerHour)} {t('hoursTotal')}
        </p>
      </div>

      <div className="p-5 space-y-4">
        {success && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-sm text-neon-green">
            <Check size={16} /> {t('created')}
          </div>
        )}

        {error && (
          <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Sana */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider flex items-center gap-1">
            <CalendarDays size={12} /> {t('date')}
          </label>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              onDateChange(e.target.value);
              setError(null);
            }}
            className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          />
        </div>

        {/* Zona */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            {t('selectZone')}
          </label>
          {availability.length ? (
            <div className="space-y-1.5">
              {availability.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    setZoneId(z.id);
                    setComputerId('');
                    setAutoPc(true);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors',
                    zoneId === z.id
                      ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                      : 'border-neon-cyan/15 bg-cyber-800/60 text-gray-300 hover:border-neon-cyan/40'
                  )}
                >
                  <span className="font-medium">{z.name} <span className="text-xs text-gray-500">({z.type})</span></span>
                  <span className="text-xs">
                    <b className="text-neon-green">{z.availableComputers}</b>
                    <span className="text-gray-500">/{z.totalComputers} {t('freeComputers')}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-neon-cyan/15 bg-cyber-800/60 text-sm text-gray-400">
              {t('notAvailable')}
            </div>
          )}
        </div>

        {/* Kompyuter */}
        {selectedZone && (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              {t('selectPc')}
            </label>
            <div className="flex items-center gap-2 mb-2">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPc}
                  onChange={(e) => setAutoPc(e.target.checked)}
                  className="accent-neon-cyan"
                />
                {t('auto')}
              </label>
            </div>
            {!autoPc && (
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                {selectedZone.computers.map((pc) => (
                  <button
                    key={pc.id}
                    type="button"
                    onClick={() => setComputerId(pc.id)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                      computerId === pc.id
                        ? 'border-neon-green/60 bg-neon-green/10 text-neon-green'
                        : 'border-neon-cyan/15 bg-cyber-800/60 text-gray-300 hover:border-neon-cyan/40'
                    )}
                  >
                    <span className="flex items-center gap-1"><Monitor size={12} /> {pc.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vaqt */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              {t('startTime')}
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              {t('endTime')}
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            />
          </div>
        </div>

        {/* Promo */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider flex items-center gap-1">
            <Ticket size={12} /> {t('promoCode')}
          </label>
          {promoApplied ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-neon-green/40 bg-neon-green/10 text-sm text-neon-green">
              <span className="flex items-center gap-1.5 font-medium">
                <BadgePercent size={14} /> {promoCode.toUpperCase()}
              </span>
              <button onClick={removePromo} className="text-xs hover:underline">{t('nonPromo')}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="YANGIYIL25"
                className="glass-input flex-1 px-3 py-2.5 text-sm uppercase outline-none rounded-xl"
              />
              <button
                type="button"
                onClick={checkPromo}
                disabled={promoLoading}
                className="px-4 rounded-xl border border-neon-cyan/30 text-neon-cyan text-sm font-medium hover:bg-neon-cyan/10"
              >
                {promoLoading ? <Loader2 size={14} className="animate-spin" /> : t('promoApply')}
              </button>
            </div>
          )}
          {promoError && <p className="text-xs text-red-400 mt-1">{promoError}</p>}
        </div>

        {/* Xulosa */}
        <div className="rounded-xl border border-neon-cyan/15 bg-cyber-800/60 p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between text-gray-400">
            <span>{t('duration')} ({durationHours.toFixed(1)} {t('hoursTotal')})</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {startTime} — {endTime}</span>
          </div>
          {date && (
            <div className="flex items-center justify-between text-gray-400">
              <span>{t('date')}</span>
              <span>{formatDate(date)}</span>
            </div>
          )}
          <div className="h-px bg-neon-cyan/10 my-1" />
          <div className="flex items-center justify-between">
            <span>{t('price')}</span>
            <span>{formatPrice(baseTotal)} {t('sum')}</span>
          </div>
          {discount > 0 && (
            <div className="flex items-center justify-between text-neon-green">
              <span>{t('discount')}</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-bold text-lg">
            <span>{t('finalPrice')}</span>
            <span className="neon-text">{formatPrice(finalTotal)} {t('sum')}</span>
          </div>
          <div className="flex items-center justify-between text-neon-cyan">
            <span>{t('advance')}</span>
            <span>{formatPrice(advance)} {t('sum')}</span>
          </div>
          <div className="flex items-center justify-between text-gray-400">
            <span>{t('remaining')}</span>
            <span>{formatPrice(remaining)} {t('sum')}</span>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={submitting || availability.length === 0}
          className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 font-bold disabled:opacity-50"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : user ? <CalendarDays size={18} /> : <LogIn size={18} />}
          {user ? t('create') : t('create')}
        </button>

        {!user && (
          <p className="text-center text-xs text-gray-500">
            <Link href="/login" className="text-neon-cyan hover:underline">
              {t('create')}
            </Link>{' '}
            uchun tizimga kiring
          </p>
        )}
      </div>
    </div>
  );
}