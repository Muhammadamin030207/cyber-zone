'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, CheckCircle2, Wallet, Banknote, AlertCircle,
  ArrowRight, BadgePercent, Clock, MapPin, Monitor, ChevronLeft, RefreshCw, FlaskConical,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Booking, BookingStatus } from '@/lib/types';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import TicketQR from '@/components/booking/TicketQR';
import SplashLoader from '@/components/ui/SplashLoader';
import ProviderLogo from '@/components/payments/ProviderLogo';
import TransferPanel, { type MerchantCard } from '@/components/payments/TransferPanel';

type PayMethod = 'PAYME' | 'CLICK' | 'UZUM' | 'PAYNET' | 'CASH' | 'TRANSFER';

const PROVIDER_UI: Record<string, { label: string; sub: string }> = {
  PAYME: { label: 'Payme', sub: 'Telefon ilovasi' },
  CLICK: { label: 'Click', sub: 'Tez va oson' },
  UZUM: { label: 'Uzum', sub: 'Raqamli bank' },
  PAYNET: { label: 'Paynet', sub: 'To\'lov terminali' },
  CASH: { label: 'Kassada', sub: 'Naqd pulda to\'lash' },
  // Qo'lda o'tkazma: hech qanday provayder/ilova kerak emas — bank ilovasida
  // o'zingiz o'tkazasiz, chekni shu yerga yuklasangiz bo'ladi.
  TRANSFER: { label: 'Karta orqali', sub: 'O\'tkazma + chek' },
};

/**
 * To'lov holati modeli — «muvaffaqiyatli» degani faqat haqiqiy tasdiqga bog'liq.
 *
 * Muhim farq: `PARTIALLY_PAID` — bu faqat oldindan to'lov (deposit) qabul qilingan,
 * to'liq to'lanmagan. Uni «to'lov muvaffaqiyatli / bron tasdiqlandi» deb ko'rsatish
 * foydalanuvchini chalg'itadi, chunki qoldiq summa to'lanishi kerak.
 *
 * Ro'yxatlar `BookingStatus` ga bog'langan — backend yangi holat qo'shsa,
 * TypeScript bu yerda darhol xato beradi.
 */
const ADMITTED_STATUSES: BookingStatus[] = ['PAID', 'CONFIRMED', 'ACTIVE', 'COMPLETED'];
const ADVANCE_PAID_STATUSES: BookingStatus[] = ['PARTIALLY_PAID', ...ADMITTED_STATUSES];
/** Hali yashayotgan holatlar — bular uchun to'lov oynasi ochiq. */
const LIVE_STATUSES: BookingStatus[] = ['PENDING', 'PENDING_PAYMENT', ...ADVANCE_PAID_STATUSES];

const TERMINAL_FAILED_PAYMENT = ['FAILED', 'CANCELLED', 'EXPIRED'];

interface ProviderInfo {
  method: string;
  label: string;
  available: boolean;
}

/**
 * Har doim mavjud bo'lishi kerakan usullar. Backend provayderlar ro'yxatini
 * qaytaradi, lekin `CASH`/`TRANSFER` provayder emas — ular har qanday holatda
 * ishlaydi, shuning uchun frontend'da qo'shiladi.
 */
const OFFLINE_METHODS: ProviderInfo[] = [
  { method: 'TRANSFER', label: 'Karta orqali', available: true },
  { method: 'CASH', label: 'Kassada', available: true },
];

export default function CheckoutPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  void params;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [sandbox, setSandbox] = useState(false);
  const [method, setMethod] = useState<PayMethod>('CASH');
  // Qo'lda o'tkazma holati
  const [transferPayment, setTransferPayment] = useState<{ id: string; status: string; amount: number } | null>(null);
  const [card, setCard] = useState<MerchantCard | null>(null);

  const [paying, setPaying] = useState(false);
  const [cashNotified, setCashNotified] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyPayment, setVerifyPayment] = useState<{ id: string } | null>(null);
  const [polling, setPolling] = useState(false);

  // Idempotency kaliti: bitta to'lov urinishida barqaror qoladi.
  // Sahifa yangilanganda yangi kalit yaratiladi (yangi to'lov niyati).
  const payIdemKey = useRef<string>(`pay_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`);

  // Provayderlar holati (qaysilari ulangan — backend javobi)
  const [providersError, setProvidersError] = useState(false);
  useEffect(() => {
    api
      .get('/api/payments/providers')
      .then(({ data }) => {
        const d = data.data;
        setProviders((d?.providers as ProviderInfo[]) || []);
        setSandbox(Boolean(d?.sandbox));
        setProvidersError(false);
      })
      // Xato yashirilmaydi: onlayn usullar yo'qligi foydalanuvchi uchun muhim.
      .catch(() => { setProviders([]); setProvidersError(true); });
  }, []);

  // Bronni qayta yuklash (to'lov tasdiqlanganda yoki chek yuborilganda)
  async function reloadBooking() {
    try {
      const { data } = await api.get(`/api/bookings/${id}`);
      const b = data.data as Booking;
      setBooking(b);
      if (ADVANCE_PAID_STATUSES.includes(b.status)) setVerified(true);
    } catch {
      /* tarmoq xatosi — jimgina qoldiramiz */
    }
  }

  // Bronni yuklash + oynada pid/test bo'lsa tasdiqlash jarayonini boshlash
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/bookings/${id}`)
      .then(({ data }) => {
        const b = data.data as Booking;
        if (cancelled) return;
        setBooking(b);
        if (ADVANCE_PAID_STATUSES.includes(b.status)) setVerified(true);
      })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Provayderdan qaytish URL: /checkout/:id/pay?pid=...
    const search = new URLSearchParams(window.location.search);
    const pid = search.get('pid');
    if (pid && !cancelled) {
      setVerifyPayment({ id: pid });
    } else if (!cancelled) {
      // Davom etmagan sessiyani qayta boshlash (aktiv to'lov bor bo'lsa)
      api
        .get(`/api/payments/${id}`)
        .then(({ data }) => {
          const active = (data.data?.payments as any[] | undefined)
            ?.find((p) => ['CREATED', 'REDIRECT_REQUIRED', 'PROCESSING'].includes(p.status));
          if (active && !cancelled) setVerifyPayment({ id: active.id });
        })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [id]);

  // To'lov holatini backend'dan kuzatish (server bu yerda provayder bilan verify qiladi)
  const verifiedRef = useRef(false);
  useEffect(() => { verifiedRef.current = verified; }, [verified]);

  useEffect(() => {
    if (!verifyPayment) return;
    let cancelled = false;
    let tries = 0;
    setPolling(true);
    const poll = async () => {
      if (cancelled) return;
      // Background tab — pollingni pauza qilamiz (tries isrof bo'lmasin), qaytganimizda davom etadi.
      if (document.visibilityState === 'hidden') {
        setTimeout(poll, 5000);
        return;
      }
      try {
        const { data } = await api.get(`/api/payments/${verifyPayment.id}/status`);
        const st = data.data?.payment?.status as string | undefined;
        const bst = data.data?.bookingStatus as BookingStatus | undefined;
        if ((st && ['PAID', 'COMPLETED'].includes(st)) || (bst && ADVANCE_PAID_STATUSES.includes(bst))) {
          setVerified(true);
          setPolling(false);
          api.get(`/api/bookings/${id}`).then((r) => { if (!cancelled) setBooking(r.data.data); }).catch(() => undefined);
          return;
        }
        if (st && TERMINAL_FAILED_PAYMENT.includes(st)) {
          setError('To\'lov amalga oshmadi. Boshqa usul bilan qayta urinib ko\'ring.');
          setPolling(false);
          return;
        }
      } catch {
        // tarmoq xatosi — qayta urinamiz
      }
      tries += 1;
      if (tries < 16 && !cancelled) setTimeout(poll, 2500);
      else if (!cancelled) {
        setPolling(false);
        // ref orqali o'qiladi: effekt yaratilgandagi `verified` qiymati doim `false` bo'lardi.
        if (!verifiedRef.current) setError('To\'lov holati hali tasdiqlanmadi. Bir ozdan so\'ng qayta tekshiring yoki kabinetdan kuzating.');
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [verifyPayment, id]);

  // To'lov sessiyasini yaratish (backend summani o'zi hisoblaydi)
  async function startPay(m: PayMethod) {
    if (!booking) return;
    setPaying(true);
    setError(null);
    try {
      const { data } = await api.post('/api/payments/create', {
        bookingId: booking.id,
        method: m,
        idempotencyKey: payIdemKey.current,
      });
      const d = data.data;
      if (m === 'TRANSFER' || d?.manual === true) {
        // Hech qanday redirect yo'q — shu sahifada karta + chek formasi ochiladi
        setTransferPayment({ id: d.payment.id, status: d.payment.status, amount: d.payment.amount });
        setCard(d.merchantCard || null);
      } else if (m === 'CASH' || (data.data?.method === 'CASH')) {
        setCashNotified(true);
      } else if (d?.checkoutUrl) {
        window.location.href = d.checkoutUrl;
      } else {
        setError(getApiErrorMessage(null, 'To\'lov xizmati hozircha mavjud emas. Iltimos, kassada to\'lash usulini tanlang.'));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'To\'lovda xatolik yuz berdi'));
    } finally {
      setPaying(false);
    }
  }

  // Chek yuborilgan holatda admin tasdig'ini kutamiz.
  // To'lov qabul qilinganda yoki bekor qilinganda to'xtaydi — cheksiz polling yo'q.
  useEffect(() => {
    if (!transferPayment) return;
    if (verified || !LIVE_STATUSES.includes(booking?.status ?? 'PENDING')) return;
    const t = setInterval(() => { void reloadBooking(); }, 5000);
    return () => clearInterval(t);
  }, [transferPayment, id, verified, booking?.status]);

  // Backend ham CASH/TRANSFER qaytarsa takrorlanib qolmasligi uchun method bo'yicha
  // birlashtiramiz — aks holda React `key` takrorlanadi va tanlov noto'g'ri ishlaydi.
  // Hook barcha `return`'lardan OLDIN turishi shart — aks holda hook tartibi buziladi.
  const dedupMethods = useMemo(() => {
    const byMethod = new Map<string, ProviderInfo>();
    for (const p of [...providers, ...OFFLINE_METHODS]) {
      if (!byMethod.has(p.method)) byMethod.set(p.method, p);
    }
    return Array.from(byMethod.values());
  }, [providers]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <SplashLoader label="Bron yuklanmoqda..." />
      </div>
    );
  }

  if (error && !booking && !verifyPayment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-3" aria-hidden="true" />
        <h1 className="text-lg font-bold mb-2">Bronni yuklab bo&apos;lmadi</h1>
        <p className="text-gray-300">{error}</p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <Link href="/dashboard" className="px-5 py-3 rounded-xl neon-btn font-bold text-sm">Kabinetga o&apos;tish</Link>
          <Link href="/rooms" className="px-5 py-3 rounded-xl btn-ghost font-semibold text-sm">Xonalar</Link>
        </div>
      </div>
    );
  }

  // Xato yo'q, lekin bron kelmagan — oq sahifa ko'rsatmaslik uchun tushunarli holat.
  if (!booking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-lg font-bold mb-2">Bron topilmadi</h1>
        <p className="text-gray-400">
          Siz so&apos;ralgan bron mavjud emas yoki o&apos;zingizga tegishli emas.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <Link href="/dashboard" className="px-5 py-3 rounded-xl neon-btn font-bold text-sm">Kabinetga o&apos;tish</Link>
          <Link href="/rooms" className="px-5 py-3 rounded-xl btn-ghost font-semibold text-sm">Xonalar</Link>
        </div>
      </div>
    );
  }

  // Noma'lum/kutilmagan holat ham «yashayotgan» hisoblanmaydi — QR berilmaydi.
  const isVoid = !LIVE_STATUSES.includes(booking.status);
  /** Deposit qabul qilindi (to'liq emas). */
  const advancePaid = ADVANCE_PAID_STATUSES.includes(booking.status) || verified;
  /** To'lov to'liq qabul qilindi — faqat shu holatda kirish QR beriladi. */
  const admitted = ADMITTED_STATUSES.includes(booking.status);
  const isPending = booking.status === 'PENDING' || booking.status === 'PENDING_PAYMENT';
  const advance = Number(booking.advanceAmount);
  const remaining = Number(booking.remainingAmount);
  const depositPercent = Number(booking.depositPercent) || 30;
  const remainderPercent = Math.max(0, 100 - depositPercent);
  /**
   * Qoldiq summa haqiqatan qolganmi. Bu `admitted`ga bog'liq EMAS: agar
   * `admitted` bilan bog'lagan bo'lsak, `PARTIALLY_PAID` holatida (deposit
   * to'lanagan, qoldiq to'lanmagan) banner umuman ko'rinmasdi.
   */
  const hasOutstanding = !isVoid && remaining > 0;

  const methodUi = PROVIDER_UI[method];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 pb-24">
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-5"
      >
        <ChevronLeft size={16} /> Kabinetga qaytish
      </button>

      <h1 className="text-2xl font-extrabold tracking-tight mb-1">To&apos;lov</h1>
      <p className="text-gray-400 text-sm mb-6">Broningizni tasdiqlash uchun {depositPercent}% oldindan to&apos;lov</p>

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {cashNotified && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
          <Wallet size={16} />
          Ruxsat berildi: {depositPercent}% ini kassada to&apos;laysiz. Admin xabarnoma oldi va bronni tasdiqlaydi. Bronni kuzatish: <Link href="/dashboard" className="underline">Kabinet</Link>
        </div>
      )}

      {polling && (
        <div role="status" aria-live="polite" className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 text-sm text-neon-cyan">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          To&apos;lov holati tekshirilmoqda...
        </div>
      )}

      {/* Booking xulosasi */}
      <div className="neo-card rounded-2xl p-5 mb-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-lg text-neon-cyan">{booking.room?.name}</h3>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin size={11} /> {booking.room?.address}
            </p>
          </div>
          <span className={cn('px-2.5 py-1 text-xs font-bold rounded-lg border',
            admitted ? 'bg-neon-green/15 text-neon-green border-neon-green/30'
              : advancePaid ? 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/30'
                : isVoid ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30')}>
            {admitted ? 'Tasdiqlandi'
              : advancePaid ? `Deposit qabul qilindi (${depositPercent}%)`
                : isVoid ? 'Bekor qilingan'
                  : 'To\'lov kutilmoqda'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-white/5 surface px-3 py-2 text-gray-300">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} /> Sana</span>
            {formatDate(booking.date)} · {booking.startTime}—{booking.endTime}
          </div>
          <div className="rounded-lg border border-white/5 surface px-3 py-2 text-gray-300">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Monitor size={11} /> Kompyuter</span>
            {booking.computer?.name || 'Avtomatik'}
          </div>
        </div>

        <div className="h-px bg-white/5 my-3" />

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Umumiy summa</span>
            <span>{formatPrice(booking.finalPrice)} so&apos;m</span>
          </div>
          {Number(booking.discountAmount) > 0 && (
            <div className="flex justify-between text-neon-green">
              <span className="flex items-center gap-1"><BadgePercent size={12} /> Chegirma</span>
              <span>-{formatPrice(booking.discountAmount)} so&apos;m</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg">
            <span>{depositPercent}% oldindan</span>
            <span className="neon-text">{formatPrice(advance)} so&apos;m</span>
          </div>
          <div className="flex justify-between text-gray-400 text-xs">
            <span>Qolgan {remainderPercent}% (joyda)</span>
            <span>{formatPrice(remaining)} so&apos;m</span>
          </div>
        </div>
      </div>

      {isPending && !advancePaid ? (
        <>
          {sandbox && (
            <div role="status" className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-200 mb-4">
              <FlaskConical size={15} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
              <span className="font-semibold">Test rejimi:</span> to&apos;lovlar sinov tariqasida
              o&apos;tadi, haqiqiy pul yig&apos;ilmaydi.
            </div>
          )}
          {providersError && !sandbox && (
            <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
              <AlertCircle size={15} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
              Onlayn to&apos;lov usullari hozircha ko&apos;rsatilmayapti. Kassada yoki karta
              orqali o&apos;tkazma orqali to&apos;lashingiz mumkin.
            </div>
          )}

          {/* To'lov usulini tanlash — bitta tanlash guruhi (radio semantics) */}
          <div role="radiogroup" aria-label="To'lov usuli" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-5">
            {dedupMethods.map((p) => {
              const ui = PROVIDER_UI[p.method];
              const disabled = !p.available;
              const selected = method === p.method;
              return (
                <button
                  key={p.method}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMethod(p.method as PayMethod)}
                  disabled={disabled}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-3.5 rounded-xl border text-left transition-colors',
                    'min-h-[64px]',
                    selected
                      ? 'border-neon-cyan/50 bg-neon-cyan/10'
                      : 'border-white/10 surface hover:border-white/25',
                    disabled && 'opacity-45'
                  )}
                >
                  <span className="shrink-0 grid place-items-center w-10 h-10 rounded-lg bg-white/5 border border-white/10">
                    <ProviderLogo method={p.method} size={24} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{ui?.label || p.label}</span>
                    <span className="block text-[11px] text-gray-500 truncate">
                      {p.available ? (ui?.sub || '') : 'Hozircha sozlanmagan'}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn('shrink-0 w-4 h-4 rounded-full border transition-colors', selected ? 'border-neon-cyan bg-neon-cyan/30' : 'border-white/20')}
                  />
                </button>
              );
            })}
          </div>

          {transferPayment ? (
            <div className="mb-5">
              <button
                onClick={() => { setTransferPayment(null); setMethod('CASH'); }}
                className="text-xs text-gray-400 hover:text-white mb-3 inline-flex items-center gap-1"
              >
                ← Boshqa usulni tanlash
              </button>
              <TransferPanel
                paymentId={transferPayment.id}
                amount={Number(transferPayment.amount)}
                merchantCard={card}
                onDone={() => { void reloadBooking(); }}
              />
            </div>
          ) : method === 'TRANSFER' ? (
            <div className="rounded-2xl border border-neon-cyan/25 bg-neon-cyan/[0.06] p-4 sm:p-5 mb-5">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-neon-cyan/15 border border-neon-cyan/25 shrink-0">
                  <ProviderLogo method="TRANSFER" size={22} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-white">Karta orqali o&apos;tkazma</h3>
                  <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                    Bank ilovangizda ko&apos;rsatiladigan raqamga pul o&apos;tkazasiz, keyin chek
                    (screenshot) shu yerga yuklaysiz. Istalgan bank ishlaydi — hech qanday
                    to&apos;lov xizmati kerak emas.
                  </p>
                  <ul className="text-[11px] text-gray-400 mt-2 space-y-1 list-disc pl-4">
                    <li>Avval pastdagi tugma bilan to&apos;lovni yarating</li>
                    <li>
                      {/* Bank nomi API'dan keladi — provayderni matnga yozib qo'yamaymiz. */}
                      {(card?.bank || 'Ko\'rsatilgan')}{' '}
                      karta raqamiga {formatPrice(advance)} so&apos;mdan o&apos;tkazing
                    </li>
                    <li>Chekni (1–3 ta rasm) shu yerga yuklang</li>
                    <li>Admin bankda tekshirib tasdiqlaydi</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : method !== 'CASH' ? (
            <div className="neo-card rounded-2xl p-5 mb-5 flex items-center gap-4">
              <span className="p-1.5 shrink-0"><ProviderLogo method={method} size={36} /></span>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{methodUi?.label} orqali to&apos;lash</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  To&apos;lov ilovasi yoki provider sahifasi ochiladi — to&apos;lov server tomonidan tasdiqlanadi.
                </p>
              </div>
              <Link href="/dashboard" className="text-xs text-neon-cyan hover:underline shrink-0">Bekor qilish</Link>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-200 mb-5">
              <p className="flex items-center gap-2 font-semibold">
                <Banknote size={16} /> {depositPercent}% ini kassada to&apos;laysiz
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                Bron davomida qolgan {remainderPercent}% ni ham kassada to&apos;lashingiz mumkin. Admin sizning broningizni kassada to&apos;lov qabul qilgandan so&apos;ng tasdiqlaydi.
              </p>
            </div>
          )}

          {verifyPayment && !verified && polling && (
            <p className="text-xs text-gray-500 text-center mb-3">
              To&apos;lovni ilovada tasdiqlaganingizdan so&apos;ng bu yerda avtomatik yangilanadi.
            </p>
          )}

          <button
            onClick={() => startPay(method)}
            disabled={paying || polling || Boolean(transferPayment) || (method !== 'CASH' && method !== 'TRANSFER' && !(providers.find((p) => p.method === method)?.available))}
            className="w-full py-3.5 rounded-xl neon-btn flex items-center justify-center gap-2 font-bold disabled:opacity-40"
          >
            {paying ? (
              <><Loader2 size={18} className="animate-spin" /> To&apos;lanmoqda...</>
            ) : polling ? (
              <><RefreshCw size={18} className="animate-spin" /> Tekshirilmoqda...</>
            ) : (
              <>
                {method === 'CASH'
                  ? 'Kassada to\'layman'
                  : method === 'TRANSFER'
                    ? <>Karta raqamini ko&apos;rsatish: {formatPrice(advance)} so&apos;m</>
                    : <>To&apos;lash: {formatPrice(advance)} so&apos;m</>}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </>
      ) : isVoid ? (
        /* Bekor qilingan / muddati o'tgan bron — QR berilmaydi. */
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertCircle size={36} className="mx-auto text-red-400 mb-3" aria-hidden="true" />
          <h2 className="text-lg font-bold mb-1.5">Bu bron bekor qilingan</h2>
          <p className="text-sm text-gray-400 mb-5">
            Bu bron endi kuchda emas va kirish QR kodi berilmaydi. Qayta bron qilish uchun xona tanlang.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link href="/rooms" className="px-5 py-3 rounded-xl neon-btn font-bold text-sm">
              Xonalarni ko&apos;rish
            </Link>
            <Link href="/dashboard" className="px-5 py-3 rounded-xl btn-ghost font-semibold text-sm">
              Kabinetga o&apos;tish
            </Link>
          </div>
        </div>
      ) : (
        <>
          {admitted && !hasOutstanding && (
            <div role="status" className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-neon-green/10 border border-neon-green/30 text-sm text-neon-green">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>To&apos;lov to&apos;liq qabul qilindi. Broningiz tasdiqlandi.</span>
            </div>
          )}
          {advancePaid && hasOutstanding && (
            <div role="status" className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 text-sm text-neon-cyan">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Oldindan to&apos;lov ({depositPercent}%) qabul qilindi. Qolgan{' '}
                <b>{formatPrice(remaining)} so&apos;m</b> — {remainderPercent}% bron davomida joyda to&apos;lanadi.
              </span>
            </div>
          )}
          {admitted && <TicketQR booking={booking} userName={user?.fullName} />}
          {!admitted && (
            <p className="mb-4 text-sm text-gray-400">
              To&apos;lov to&apos;liq tasdiqlangach kirish QR kodi ko&apos;rsatilmaydi.
            </p>
          )}
          <Link
            href="/dashboard"
            className="mt-4 w-full block text-center py-3.5 rounded-xl neon-btn font-bold"
          >
            {hasOutstanding
              ? `Qolgan ${remainderPercent}% joyda — Kabinetga o'tish`
              : "Kabinetga o'tish"}
          </Link>
        </>
      )}
    </div>
  );
}