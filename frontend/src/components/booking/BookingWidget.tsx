'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CalendarDays, Clock, BadgePercent, Check, Loader2, Ticket, Zap, ShieldCheck,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room, AvailabilityZone, CreateBookingPayload } from '@/lib/types';
import { formatPrice, formatDate, toNumber, cn, todayISO, businessNowHHMM, newIdempotencyKey } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import SeatMap, { type SeatInfo } from './SeatMap';

interface Props {
  room: Room;
  date: string;
  onDateChange: (date: string) => void;
  availability: AvailabilityZone[];
  availabilityLoading?: boolean;
}

interface PromoCheck {
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Oraliqni daqiqalar ko'rinishiga o'tkazadi; tugash boshlanishdan oldin bo'lsa yarim tundan oshgan deb hisoblanadi (23:00 -> 00:00 = 1380..1440). */
function spanOf(start: string, end: string): { start: number; end: number } {
  const s = minutesOf(start);
  let e = minutesOf(end);
  if (e <= s) e += 1440;
  return { start: s, end: e };
}

/** Daqiqa -> "HH:MM" (1440 = 24:00 chegarasidan oshsa "23:59"). */
function minutesToHHMM(total: number): string {
  const clamped = Math.min(Math.max(0, Math.round(total)), 1439);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function BookingWidget({ room, date, onDateChange, availability, availabilityLoading = false }: Props) {
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
  const [usePoints, setUsePoints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // §13: moslashuvchan (custom) davomiylik — 0.5 soat qadamida, chips + qo'lda kiritish
  const [customH, setCustomH] = useState('');
  // UNLIMITED sessiya: taymer yo'q — sarflangan vaqt bo'yicha hisob, admin yopadi.
  const [useUnlimited, setUseUnlimited] = useState(false);

  // Tanlangan zona render paytida YECHILADI (effect emas): sana almashsa
  // eski zona mavjudlik ro'yxatidan "yo'qoladi" va birinchi zona qo'llanadi.
  // Effect orqali bu holat avval 1 qo'shimcha render kechikardi.
  const selectedZone = availability.find((z) => z.id === zoneId) || availability[0] || null;
  const effectiveZoneId = selectedZone?.id ?? '';

  // Xudsi shunday: zona o'zgarganda `computerId` eskirishi mumkin — u
  // endi tanlangan zonada mavjud bo'lmasa bo'sh hisoblanadi.
  const effectiveComputerId =
    computerId && (selectedZone?.allComputers || []).some((c) => c.id === computerId) ? computerId : '';

  const pricePerHour = selectedZone ? toNumber(selectedZone.pricePerHour) : 0;

  // Yarim tundan oshuvchi oraliqlarni to'g'ri hisoblash (23:00 -> 00:00 = 1380..1440)
  const { start: startMin, end: endMin } = spanOf(startTime, endTime);

  // UNLIMITED: mijoz tugash vaqtini TANGLAMAYDI. Kompyuterni ushlab turish
  // oynasi xona yopilishigacha (yoki 24:00 gacha) cho'ziladi — backend ham
  // shunday hisoblaydi. Eski `endTime` (masalan 18:00) unlimited uchun
  // ma'nosiz va bo'shlikni tor qilib qo'yardi: 18:00 dan keyin ham kompyuter
  // bo'sh bo'lsa ham "band" ko'rinardi.
  const dayCloseMin = useMemo(() => {
    const close = room.workingHours?.close;
    if (close) return minutesOf(close);
    return 24 * 60; // ish vaqti ko'rsatilmagan — kun oxirigacha
  }, [room.workingHours?.close]);

  const holdEndMin = useUnlimited
    ? (startMin < dayCloseMin ? dayCloseMin : 24 * 60)
    : endMin;

  const durationHours = Math.max(0, (holdEndMin - startMin) / 60);
  // UNLIMITED uchun "vaqt tanlanganmi" degan savol yo'q — faqat boshlanish
  // vaqti xona ish vaqtiga to'g'ri kelishi kerak.
  const timeOk = useUnlimited ? startMin < dayCloseMin : (endMin - startMin) > 0;

  // Serverdan kelgan bo'sh vaqt oynalari (freeWindows) — daqiqalarga, yarim tundan oshsa wraplanadi
  const byComputerWindows = useMemo(() => {
    if (!selectedZone) return [];
    return (selectedZone.allComputers || []).map((c) => ({
      id: c.id,
      status: c.status,
      windows: (c.freeWindows || []).map((w) => spanOf(w.start, w.end)),
    }));
  }, [selectedZone]);

  // Tanlangan oynada bo'sh kompyuterlar soni: ish vaqti + band vaqtlar hisobga olinadi
  const freeInWindow = useMemo(() => {
    if (!selectedZone || !timeOk) return 0;
    return byComputerWindows.filter(
      (c) => c.status === 'AVAILABLE' && c.windows.some((w) => w.start <= startMin && w.end >= holdEndMin)
    ).length;
  }, [byComputerWindows, startMin, holdEndMin, timeOk, selectedZone]);

  // Tanlangan kompyuter ushbu oynada bo'shmi (manual tanlov uchun)
  const selectedComputerFree = useMemo(() => {
    if (autoPc || !effectiveComputerId) return true;
    const comp = byComputerWindows.find((c) => c.id === effectiveComputerId);
    if (!comp || comp.status !== 'AVAILABLE') return false;
    return comp.windows.some((w) => w.start <= startMin && w.end >= holdEndMin);
  }, [autoPc, effectiveComputerId, byComputerWindows, startMin, holdEndMin]);

  // Tanlangan boshlanish vaqtidan maksimal mumkin bo'lgan davomiylik
  const maxDurationHours = useMemo(() => {
    if (!timeOk) return 0;
    let maxEnd = startMin;
    for (const c of byComputerWindows) {
      if (c.status !== 'AVAILABLE') continue;
      for (const w of c.windows) {
        if (w.start <= startMin && w.end > maxEnd) maxEnd = w.end;
      }
    }
    return Math.max(0, (maxEnd - startMin) / 60);
  }, [byComputerWindows, startMin, timeOk]);

  // Bugun (Toshkent) uchun o'tgan vaqtni bloklash
  const isToday = date === todayISO();
  const startInPast = isToday && minutesOf(startTime) < minutesOf(businessNowHHMM());

  // Tanlangan davomiylik mavjud oynalardan oshib ketgan bo'lsa — foydalanuvchiga tushunarli ogohlantirish.
  // UNLIMITED uchun "maksimal davomiylik" tushunchasi yo'q — faqat boshlanish
  // vaqti muhim, shuning uchun bu tekshiruv o'chiriladi.
  const durationExceeds = !useUnlimited && timeOk && durationHours > maxDurationHours + 1e-9;

  function applyDuration(hours: number) {
    const [sh, sm] = startTime.split(':').map(Number);
    const total = sh * 60 + sm + hours * 60;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    const next = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    setEndTime(next);
  }

  function applyCustomDuration() {
    const h = Number(String(customH).replace(',', '.'));
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      return false;
    }
    const [sh, sm] = startTime.split(':').map(Number);
    const total = sh * 60 + sm + h * 60;
    if (total > 24 * 60) {
      return false;
    }
    applyDuration(h);
    return true;
  }

  const DURATIONS = [1, 2, 3, 4, 6];

  // UNLIMITED: narx har doim BIR soatlik. `durationHours` esa oqim
  // "tanlangan endTime" dan keladi va unlimited uchun ma'nosiz — shuning
  // uchun bazaviy summa 1 soatga tenglanadi (backend `duration = 1` bilan
  // bir xil mantiq). Aks holda chegirma/ballar N soatlik summa ustida
  // hisoblanib, mijozga barchasidan katta raqam ko'rsatilardi.
  const baseTotal = pricePerHour * (useUnlimited ? 1 : durationHours);

  const discount = useMemo(() => {
    if (!promo || !promoApplied) return 0;
    const raw = promo.discountType === 'PERCENTAGE' ? (baseTotal * promo.discountValue) / 100 : promo.discountValue;
    return Math.min(raw, baseTotal);
  }, [promo, promoApplied, baseTotal]);

  const afterPromo = Math.max(0, baseTotal - discount);

  // Bonus ballar: 1 bal = 1 so'm, narxning 50% gacha
  const pointsBalance = user?.loyaltyBalance || 0;
  const pointsCap = Math.floor(afterPromo * 0.5);
  const pointsUsed = usePoints ? Math.min(pointsBalance, pointsCap) : 0;

  const finalTotal = Math.max(0, afterPromo - pointsUsed);

  // UNLIMITED: narx DOIM bir soatlik. Backend shuni bronga yozadi
  // (`duration = 1`), qolgani sessiya tugagach haqiqiy sarflangan
  // vaqt bo'yicha kassada yopiladi. §17.
  //
  // Chegirma va bonus ballar bir soatlik SUMMAga ham qo'llanadi — shuning
  // uchun `finalTotal`ni ishlatamiz (backend `prepayFull` bilan `advance =
  // finalTotal`, ya'ni 100% oldindan to'lanadi). Avval `pricePerHour * 0.3`
  // ko'rsatilardi: mijoz 30% to'lab, "bir soat oldindan" degani yolg'on
  // bo'lib chiqardi.
  const displayTotal = finalTotal;
  const advance = useUnlimited ? Math.round(finalTotal) : Math.round(finalTotal * 0.3);
  const remaining = useUnlimited ? 0 : Math.max(0, displayTotal - advance);

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
    if (isToday && startInPast) {
      setError('Boshlanish vaqti allaqachon o\u2018tib ketgan. Boshqa vaqtni tanlang.');
      return;
    }
    if (!effectiveZoneId || !timeOk) {
      setError(t('notAvailable'));
      return;
    }
    if (durationExceeds) {
      setError(
        `Bu davomiylik uchun vaqt yetarli emas — maksimal ${maxDurationHours.toFixed(maxDurationHours % 1 === 0 ? 0 : 1)} soat. Boshlanish vaqtini yoki davomiylikni kamaytiring.`
      );
      return;
    }
    if (freeInWindow === 0) {
      setError('Bu vaqt oralig\u2018ida bo\u2018sh kompyuter yo\u2018q. Boshqa vaqtni tanlang.');
      return;
    }
    if (!autoPc && effectiveComputerId && !selectedComputerFree) {
      setError('Tanlangan kompyuter bu vaqtda band. Boshqa kompyuter yoki vaqtni tanlang.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateBookingPayload = {
        roomId: room.id,
        zoneId: effectiveZoneId,
        date,
        startTime,
        // UNLIMITED: "hold" oxiri — xona yopilishi (yoki 24:00). Sabab: bron
        // kompyuterni shu oralig'ga ushlab turadi va boshqa bron bilan
        // to'qnashuv shu oynada tekshiriladi. Davomiylik esa 1 soat
        // (backend `duration = 1`), haqiqiy sarf session da hisoblanadi.
        endTime: holdEndMin >= 1440 ? '23:59' : minutesToHHMM(holdEndMin),
        durationHours: useUnlimited ? 1 : durationHours,
        // UNLIMITED: bron hamon intervalni ushlab turadi (hold), LEKIN sessiya
        // taymer bilan yopilmaydi — Sarflangan vaqt bo'yicha hisoblanadi.
        ...(useUnlimited ? { sessionType: 'UNLIMITED' } : {}),
        // Ikkinchi marta bosish / refresh takroriy bron yaratmasligi uchun idempotentlik kaliti
        idempotencyKey: newIdempotencyKey('booking'),
      };
      if (!autoPc && effectiveComputerId) payload.computerId = effectiveComputerId;
      if (promoApplied && promoCode) payload.promoCode = promoCode;
      if (usePoints && pointsBalance > 0) payload.usePoints = true;

      const { data } = await api.post('/api/bookings', payload);
      const bookingId = data.data?.id;
      router.push(bookingId ? `/checkout/${bookingId}` : '/dashboard');
      setSuccess(true);
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      const msg = getApiErrorMessage(err, t('notAvailable'));
      if (code === 'BOOKING_TIME_ALREADY_RESERVED') {
        setError('Tanlangan vaqt band. Boshqa vaqt yoki kompyuterni tanlang.');
      } else if (code === 'BOOKING_OUTSIDE_WORKING_HOURS') {
        setError('Tanlangan vaqt ish vaqtidan tashqari. Ish vaqtini tekshiring.');
      } else if (code === 'ROOM_FULL') {
        setError('Bu vaqt uchun bo\u2018sh kompyuter qolmadi. Boshqa vaqtni tanlang.');
      } else if (code === 'BOOKING_IN_PAST') {
        setError('Boshlanish vaqti o\u2019tib ketgan. Kelajakdagi vaqtni tanlang.');
      } else if (code === 'INVALID_DURATION') {
        setError('Tanlangan davomiylik noto\u2019g\u2019ri. Tugash vaqti boshlanish vaqtidan keyin bo\u2018lishi kerak.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isStaff = !!user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Zap size={18} className="text-neon-cyan" /> {t('title')}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {t('perHour')} {formatPrice(pricePerHour)} {t('hoursTotal')}
        </p>
      </div>

      {isStaff ? (
        <div className="p-6 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 flex items-center justify-center">
            <ShieldCheck size={26} className="text-yellow-400" />
          </div>
          <p className="font-bold text-lg mb-1">Siz xodim sifatida kirdingiz</p>
          <p className="text-sm text-gray-400 leading-relaxed">
            Bron qilish faqat foydalanuvchilar uchun. Siz bronlarni{' '}
            {user?.role === 'SUPER_ADMIN' ? 'boshqaruv panelidan' : 'admin panelidan'} boshqarasiz.
          </p>
          <Link
            href={user?.role === 'SUPER_ADMIN' ? '/super-admin' : '/admin'}
            className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 rounded-xl neon-btn text-sm font-bold"
          >
            <ShieldCheck size={15} /> Boshqaruv paneli
          </Link>
        </div>
      ) : (
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
            min={todayISO()}
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
                    effectiveZoneId === z.id
                      ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                      : 'border-white/10 surface text-gray-300 hover:border-neon-cyan/40'
                  )}
                >
                  <span className="flex-1 font-medium">{z.name}</span>
                  <span className="text-xs flex items-center gap-2">
                    <span className="text-gray-500">{formatPrice(z.pricePerHour)} so‘m/soat</span>
                    <span className={`px-1.5 py-0.5 rounded-md font-bold ${
                      z.availableComputers === 0 ? 'bg-red-500/15 text-red-400' : 'bg-neon-green/10 text-neon-green'
                    }`}>
                      {z.availableComputers}
                      <span className="font-normal text-gray-500">/{z.totalComputers}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 surface text-sm text-gray-400">
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
              <SeatMap
                computers={(selectedZone.allComputers || []).map((c) => {
                  const wc = byComputerWindows.find((w) => w.id === c.id);
                  // canBook: kompyuter ish vaqtida bo'sh oynasi bu vaqt oralig'ini to'liq qoplashi kerak
                  const freeHere =
                    wc?.status === 'AVAILABLE' &&
                    (wc.windows.some((w) => w.start <= startMin && w.end >= holdEndMin) ?? false);
                  return {
                    id: c.id,
                    name: c.name,
                    specs: c.specs,
                    status: c.status as SeatInfo['status'],
                    canBook: !!freeHere,
                  };
                })}
                selectedId={effectiveComputerId}
                onSelect={(id) => setComputerId(id)}
              />
            )}
          </div>
        )}

        {/* Vaqt */}
        <div>
          {/* ====== UNLIMITED: duration / end-time inputlari YASHIRILADI ======
              Cheksiz sessiyada vaqt chegarasi yo'q — foydalanuvchi faqat
              BOSHLASH vaqtini tanlaydi. Davomiylik va tugash vaqti so'ralmaydi,
              chunki ular mavjud emas: hisob haqiqiy sarflangan vaqt bo'yicha
              yuradi va kassada yopiladi (§16). */}
          {useUnlimited ? (
            <div className="rounded-xl border border-[#ff7a1a]/25 bg-[#ff7a1a]/[0.06] px-3.5 py-3 mb-3">
              <p className="text-sm font-semibold text-[#ff7a1a]">Cheksiz sessiya</p>
              <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                Davomiylik va tugash vaqti belgilanmaydi. Xona yopilgunicha
                o&apos;tkazib yotishingiz mumkin — to&apos;lov har soat uchun
                sarflangan vaqt bo&apos;yicha hisoblanadi.
              </p>
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">
              {t('duration')}
            </label>
          </div>
          <div className="flex gap-2 mb-3">
            {DURATIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => applyDuration(h)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  Math.round(durationHours) === h
                    ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                    : 'border-neon-cyan/15 text-gray-400 hover:border-neon-cyan/40 hover:text-neon-cyan'
                }`}
              >
                {h} soat
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustomDuration(); } }}
              placeholder="0.5"
              aria-label="Custom davomiylik (soat)"
              className="glass-input w-24 rounded-xl px-3 py-1.5 text-sm outline-none text-center"
            />
            <button
              type="button"
              onClick={() => applyCustomDuration()}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                Math.abs(durationHours - Number(String(customH).replace(',', '.'))) < 0.01
                  ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                  : 'border-neon-cyan/15 text-gray-400 hover:border-neon-cyan/40 hover:text-neon-cyan'
              }`}
            >
              Custom soat
            </button>
            <span className="text-[11px] text-gray-500">0.5–24 soat</span>
          </div>
          <label className="flex items-start gap-2.5 mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useUnlimited}
              onChange={(e) => setUseUnlimited(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#ff7a1a]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-200">Cheksiz sessiya</span>
              <span className="block text-[11px] text-gray-500 leading-relaxed">
                Vaqt chegarasi yo&apos;q — taymer yopmaydi, sarflangan vaqt bo&apos;yicha
                avtomatik hisoblanadi (min 1 soat). Sessiyani admin yoki siz yakunlaysiz.
              </span>
            </span>
          </label>
          <div className={`grid gap-3 ${useUnlimited ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                {t('startTime')}
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none ${!timeOk ? 'border-red-500/50' : ''}`}
              />
            </div>
            {/* UNLIMITED: end time mavjud emas — maydon butunlay yashiriladi */}
            {!useUnlimited && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                {t('endTime')}
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={`glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none ${!timeOk ? 'border-red-500/50' : ''}`}
              />
            </div>
            )}
          </div>
          {!timeOk && !useUnlimited && (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak.
            </p>
          )}
          {timeOk && !useUnlimited && durationExceeds && (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              Bu davomiylik uchun vaqt yetarli emas — maksimal{' '}
              {maxDurationHours.toFixed(maxDurationHours % 1 === 0 ? 0 : 1)} soat.
            </p>
          )}
          {timeOk && !useUnlimited && !durationExceeds && freeInWindow === 0 && (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              Bu vaqt oralig‘ida bo‘sh kompyuter yo‘q — boshqa vaqtni tanlang.
            </p>
          )}
          {timeOk && freeInWindow > 0 && autoPc && (
            <p className="text-xs text-gray-500 mt-1.5">
              Bu vaqtda {freeInWindow} ta bo‘sh kompyuter bor.
            </p>
          )}
          </>
          )}
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

        {/* Bonus ballar */}
        {pointsBalance > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Bonus ballar ({pointsBalance.toLocaleString('ru-RU')} bal bor)
            </label>
            <button
              type="button"
              onClick={() => setUsePoints((v) => !v)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors',
                usePoints ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300' : 'border-white/10 surface text-gray-300 hover:border-yellow-400/25'
              )}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Zap size={14} /> Ballarni ishlatish
              </span>
              <span className="text-xs">
                {usePoints ? `-${formatPrice(pointsUsed)} ${t('sum')}` : `${formatPrice(pointsUsed)} ${t('sum')}`}
              </span>
            </button>
            <p className="text-[10px] text-gray-500 mt-1">1 bal = 1 so&apos;m · maks. {Math.min(pointsBalance, pointsCap).toLocaleString('ru-RU')} bal ishlatiladi (50%).</p>
          </div>
        )}

        {/* Xulosa */}
        <div className="rounded-xl surface border border-white/10 p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between text-gray-400">
            <span className="flex items-center gap-1.5"><Clock size={13} className="text-neon-cyan" /> {t('duration')}</span>
            {useUnlimited ? (
              // Unlimited da tugash vaqti YO'Q — "soat" ko'rsatib, keyin
              // "cheksiz" deb yolg'on vaqt chegarasi berish mumkin emas.
              <span className="text-gray-300 font-medium">
                {t('unlimited')} · boshlanish {startTime} · 1 soat oldindan to&apos;lov
              </span>
            ) : (
              <span className="text-gray-300 font-medium">{durationHours.toFixed(1)} {t('hoursTotal')} · {startTime} — {endTime}</span>
            )}
          </div>
          {date && (
            <div className="flex items-center justify-between text-gray-400">
              <span className="flex items-center gap-1.5"><CalendarDays size={13} className="text-neon-cyan" /> {t('date')}</span>
              <span className="text-gray-300 font-medium">{formatDate(date)}</span>
            </div>
          )}
          <div className="h-px bg-gradient-to-r from-transparent via-neon-cyan/20 to-transparent my-1" />
          <div className="flex items-center justify-between text-gray-400">
            <span>{t('price')}</span>
            <span>{formatPrice(baseTotal)} {t('sum')}</span>
          </div>
          {discount > 0 && (
            <div className="flex items-center justify-between text-neon-green font-medium">
              <span>{t('discount')}</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          {pointsUsed > 0 && (
            <div className="flex items-center justify-between text-yellow-400 font-medium">
              <span className="flex items-center gap-1.5"><Zap size={12} /> Bonus ballar</span>
              <span>-{formatPrice(pointsUsed)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-lg">
            <span className="text-gray-300 font-semibold">{t('finalPrice')}</span>
            <span className="neon-text font-extrabold">{formatPrice(finalTotal)} {t('sum')}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-neon-cyan/5 border border-neon-cyan/15 space-y-1">
            <div className="flex items-center justify-between text-neon-cyan font-medium">
              <span>{useUnlimited ? t('advanceLabel') : t('advance')}</span>
              <span>{formatPrice(advance)} {t('sum')}</span>
            </div>
            {!useUnlimited && (
              <div className="flex items-center justify-between text-gray-400">
                <span>{t('remaining')}</span>
                <span>{formatPrice(remaining)} {t('sum')}</span>
              </div>
            )}
            {useUnlimited && (
              <p className="text-[11px] text-gray-400 leading-snug pt-1">{t('unlimitedAdvanceHint')}</p>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={submitting || availabilityLoading || availability.length === 0 || !timeOk || (isToday && startInPast) || durationExceeds || freeInWindow === 0 || (!autoPc && Boolean(effectiveComputerId) && !selectedComputerFree)}
          className="w-full py-3.5 rounded-xl neon-btn flex items-center justify-center gap-2 font-bold text-base disabled:opacity-50"
        >
          {submitting || availabilityLoading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
          {availabilityLoading ? 'Mavjudlik yangilanmoqda...' : `${t('create')} · ${formatPrice(finalTotal)} ${t('sum')}`}
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
      )}
    </div>
  );
}