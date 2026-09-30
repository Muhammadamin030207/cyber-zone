'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, CheckCircle2, Wallet, Banknote, AlertCircle,
  ArrowRight, BadgePercent, Clock, MapPin, Monitor, ChevronLeft, RefreshCw, FlaskConical,
  Copy, Check, ExternalLink, Info,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Booking, BookingStatus, Payment } from '@/lib/types';
import { formatPrice, formatDate, cn, newIdempotencyKey } from '@/lib/utils';
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
  { method: 'CASH', label: 'Kassada', available: true },
];

/**
 * Qo'lda o'tkazma (karta) usullari — faqat §22 dagi to'rtala ommaviy usul
 * plus umumiy o'tkazma. UZCARD / HUMO / VISA alohida "to'lov usuli" emas:
 * ular karta TURLARI. Admin ularni karta ma'lumotida (bank nomi sifatida)
 * saqlashi mumkin, lekin foydalanuvchi ularni tanlay olmaydi.
 */
const CARD_METHODS = ['PAYME', 'CLICK', 'PAYNET', 'UZUM', 'TRANSFER'] as const;

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
  /**
   * BARCHA sozlangan dogaon kartalar — usul (UZUM, PAYME...) -> karta.
   * Chekout usullar ro'yxati SHUNDAN quriladi: karta sozlangan usul har
   * doim tanlanadi va karta DARHOL ko'rsatiladi (to'lov yaratilishini
   * kutmaydi). Endi "karta sozlangan-u lekin ko'rsatilmayapti" bo'lmaydi.
   */
  const [cardsByMethod, setCardsByMethod] = useState<Record<string, MerchantCard>>({});
  /**
   * TO'LOV FOIZI — mijoz xohlagan foizda yoki to'liq to'lashi mumkin.
   * `null` = minimal depozit (brondagi `depositPercent`). Server pastga
   * cheklaydi, shuning uchun bu faqat yuqoriga (50/70/100) yo'naltiradi.
   */
  const [payPercent, setPayPercent] = useState<number | null>(null);
  // Qo'lda o'tkazma holati
  const [transferPayment, setTransferPayment] = useState<{ id: string; status: string; amount: number; receiptNumber: string | null } | null>(null);
  const [card, setCard] = useState<MerchantCard | null>(null);

  const [paying, setPaying] = useState(false);
  const [cashNotified, setCashNotified] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyPayment, setVerifyPayment] = useState<{ id: string } | null>(null);
  const [polling, setPolling] = useState(false);

  // Idempotency kaliti: bitta to'lov urinishida barqaror qoladi.
  // Render paytida emas, `startPay` ichida birinchi marta yaratiladi —
  // `Date.now()`/`Math.random()` render'da noto'g'ri (render toza bo'lishi
  // shart). Sahifa yangilanganda `ref` bo'sh bo'ladi -> yangi kalit.
  const payIdemKey = useRef<string>('');

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

    // BARCHA sozlangan dogaon kartalar — usullar ro'yxati shundan quramiz.
    api
      .get('/api/payments/merchant-cards')
      .then(({ data }) => setCardsByMethod((data.data?.cards as Record<string, MerchantCard>) || {}))
      .catch(() => setCardsByMethod({}));
  }, []);

  /**
   * Karta rezolyutsiyasi — backend `resolveMerchantCard` oqimi bilan bir xil:
   * aniq usul -> DEFAULT -> null. Chekout usuli selectable bo'lishi uchun
   * shu usul yoki DEFAULT karta bo'lishi kerak.
   */
  const cardFor = useCallback((m: string): MerchantCard | null => {
    const key = m.toUpperCase();
    if (cardsByMethod[key]) return cardsByMethod[key];
    if (key !== 'DEFAULT' && cardsByMethod['DEFAULT']) return cardsByMethod['DEFAULT'];
    return null;
  }, [cardsByMethod]);

  // Bronni qayta yuklash (to'lov tasdiqlanganda yoki chek yuborilganda).
  // `useCallback` — polling effect'ining dependency'siga kirishi uchun
  // (har render'da yangi funksiya hosil bo'lsa, interval har safar
  // qayta o'rnatilib ketadi).
  const reloadBooking = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/bookings/${id}`);
      const b = data.data as Booking;
      setBooking(b);
      if (ADVANCE_PAID_STATUSES.includes(b.status)) setVerified(true);
    } catch {
      /* tarmoq xatosi — jimgina qoldiramiz */
    }
  }, [id]);

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
          const active = (data.data?.payments as Payment[] | undefined)
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
    if (!payIdemKey.current) payIdemKey.current = newIdempotencyKey('pay');
    setPaying(true);
    setError(null);
    try {
      const { data } = await api.post('/api/payments/create', {
        bookingId: booking.id,
        method: m,
        idempotencyKey: payIdemKey.current,
        // Faqat xohlangan bo'lsa yuboriladi — `null` bo'lsa backend brondagi
        // minimal foizni o'zi oladi.
        ...(payPercent !== null ? { depositPercent: payPercent } : {}),
      });
      const d = data.data;
      if (cardFor(m) || d?.manual === true) {
        // Hech qanday redirect yo'q — shu sahifada karta + chek formasi ochiladi.
        // Karta oldindan yuklangan `cardFor(m)` dan, keyin server javobidagi
        // (authoritative) `merchantCard` bilan almashiladi.
        setTransferPayment({
          id: d.payment.id,
          status: d.payment.status,
          amount: d.payment.amount,
          receiptNumber: d.payment.receiptNumber ?? null,
        });
        setCard((d.merchantCard as MerchantCard | null) || cardFor(m));
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
  }, [transferPayment, reloadBooking, verified, booking?.status]);

  // Tanlash mumkin bo'lgan usullar:
  //   1) Karta sozlangan usullar (qo'lda o'tkazma) — ALWAYS mavjud.
  //   2) Real ermasdan ulangan provayderlar (gateway) — bularga redirect.
  //   3) Kassada (naqd).
  // Provayder "not_configured" bo'lishi endi kartani yashirmaydi — karta bor
  // bo'lsa usul tanlanadi. (Eski xatolik: admin UZUM kartasini saqlagan,
  // lekin UZUM provider sozlanmagani uchun usul disabled bo'lib chiqardi.)
  const methodList = useMemo(() => {
    const list: ProviderInfo[] = [];
    const seen = new Set<string>();
    for (const m of CARD_METHODS) {
      if (cardFor(m)) {
        list.push({ method: m, label: PROVIDER_UI[m]?.label || m, available: true });
        seen.add(m);
      }
    }
    for (const p of providers) {
      if (seen.has(p.method)) continue;
      if (p.available) {
        list.push(p);
        seen.add(p.method);
      }
    }
    for (const p of OFFLINE_METHODS) {
      if (!seen.has(p.method)) {
        list.push(p);
        seen.add(p.method);
      }
    }
    return list;
  }, [providers, cardFor]);

  // Dastlabki tanlov: karta sozlangan usul bo'lmasa — kassada.
  useEffect(() => {
    setMethod((prev) => {
      if (methodList.some((p) => p.method === prev)) return prev;
      const firstCard = methodList.find((p) => p.method !== 'CASH' && cardFor(p.method));
      return (firstCard?.method as PayMethod) || 'CASH';
    });
  }, [methodList, cardFor]);

  /**
   * To'lov foizi variantlari — 10% dan 100% gacha har 10% da, PLUS custom.
   * Tanlangan foiz minimal depozitdan (bronda) PAST bo'lsa server uni yuqoriga
   * to'g'rilaydi (`Math.max(minPercent, ...)`) — bu yerda ham xuddi shu
   * qiymat ko'rsatiladi va mijozga izoh beriladi.
   */
  const percentOptions = useMemo(() => {
    const base = Math.max(1, Math.trunc(Number(booking?.depositPercent) || 30));
    const values: number[] = [];
    for (let v = 10; v <= 100; v += 10) values.push(v);
    if (!values.includes(base)) values.push(base);
    return values
      .sort((a, b) => a - b)
      .map((value) => ({ value, label: value === 100 ? "To'liq" : `${value}%` }));
  }, [booking?.depositPercent]);
  /** «Boshqa» (custom) foiz rejimi. */
  const [customPercentOpen, setCustomPercentOpen] = useState(false);
  const [customPercent, setCustomPercent] = useState('');

  /** Hozir tanlangan foiz (tanlanmasa — brondagi minimal). */
  const parsedCustom = Math.trunc(Number(customPercent));
  const selectedPercent = Math.max(
    Math.trunc(Number(booking?.depositPercent) || 30),
    customPercentOpen ? (Number.isInteger(parsedCustom) && parsedCustom >= 1 ? parsedCustom : 0) : (payPercent ?? 0)
  );
  /** Tanlangan foiz bo'yicha to'lov summasi (server hisobi bilan bir xil). */
  const payAmount = Math.round(Number(booking?.finalPrice) * (selectedPercent / 100));
  const customBelowMin = customPercentOpen && selectedPercent === (Math.trunc(Number(booking?.depositPercent) || 30)) && parsedCustom < (Math.trunc(Number(booking?.depositPercent) || 30));

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
  /** Tanlangan usul uchun karta (faqat agar mapping bo'lsa). */
  const selectedPreviewCard = cardFor(method);

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

          {/* TO'LOV FOIZI — mijoz 10% dan 100% gacha tanlaydi yoki custom
              kiritadi. Server pastga cheklaydi (brondan kam to'lash mumkin
              emas) — shu sabab past foiz tanlansa izoh ko'rsatiladi. */}
          {!transferPayment && percentOptions.length > 1 && (
            <fieldset className="rounded-2xl border border-white/10 surface p-4 mb-5">
              <legend className="px-2 text-xs text-gray-400 flex items-center gap-1.5">
                <BadgePercent size={12} aria-hidden="true" /> Qancha to&apos;lamoqchisiz?
              </legend>
              <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-5 gap-2 mt-1">
                {percentOptions.map((opt) => {
                  const selected = !customPercentOpen && (payPercent ?? depositPercent) === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setCustomPercentOpen(false); setCustomPercent(''); setPayPercent(opt.value === depositPercent ? null : opt.value); }}
                      aria-pressed={selected}
                      className={cn(
                        'px-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                        selected
                          ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                          : 'border-white/10 hover:border-white/25 text-gray-300'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => { setCustomPercentOpen((v) => !v); setPayPercent(null); }}
                  aria-pressed={customPercentOpen}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors',
                    customPercentOpen
                      ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                      : 'border-white/10 hover:border-white/25 text-gray-400'
                  )}
                >
                  Boshqa (custom)
                </button>
                {customPercentOpen && (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      inputMode="numeric"
                      value={customPercent}
                      onChange={(e) => setCustomPercent(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      placeholder="10–100"
                      aria-label="To'lov foizi (maskimal 100)"
                      className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-sm w-24 outline-none focus:border-neon-cyan/60"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                )}
              </div>
              {customPercentOpen && customPercent !== '' && !(Number.isInteger(parsedCustom) && parsedCustom >= 1 && parsedCustom <= 100) && (
                <p className="mt-2 text-[11px] text-amber-400">Foiz 1–100 orasida bo&apos;lishi kerak</p>
              )}
              <p className="mt-2.5 text-[11px] text-gray-500">
                {formatPrice(payAmount)} so&apos;m to&apos;laysiz
                {customBelowMin && (
                  <> — minimal depozit {depositPercent}% — server avtomatik to&apos;g&apos;rilaydi</>
                )}
                {!customBelowMin && selectedPercent > depositPercent && (
                  <> — qolgan {100 - selectedPercent}% keyin, joyda to&apos;lanadi</>
                )}
                {selectedPercent === 100 && (<> — bitta to&apos;lovda hammasi yopiladi</>)}
              </p>
            </fieldset>
          )}

          {/* To'lov usulini tanlash — bitta tanlash guruhi (radio semantics) */}
          <div role="radiogroup" aria-label="To'lov usuli" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-5">
            {methodList.map((p) => {
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
            /* Karta ma'lumotlari TransferPanel ichida — qayta ko'rsatmaymiz,
               aks holda bir xil raqam va bank ikki marta chiqadi. */
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
                appName={PROVIDER_UI[method]?.label}
                receiptNumber={transferPayment.receiptNumber}
                onDone={() => { void reloadBooking(); }}
              />
            </div>
          ) : selectedPreviewCard ? (
            <CardPreviewCard card={selectedPreviewCard} method={method} amount={payAmount} />
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

          {/* To'lov allaqachon yaratilgan bo'lsa CTA ko'rsatilmaydi — eski
              kodda u `disabled` bo'lib qolardi va sababsiz o'chgan holda
              ekranda turardi. TransferPanel o'zining "yuborish" tugmasini
              ko'rsatadi, kassada esa `cashNotified` banneri bor. */}
          {!transferPayment && !cashNotified && (
            <button
              onClick={() => startPay(method)}
              disabled={paying || polling || (method !== 'CASH' && !cardFor(method) && !(providers.find((p) => p.method === method)?.available))}
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
                    : cardFor(method)
                      ? <>To&apos;lovni boshlash: {formatPrice(payAmount)} so&apos;m</>
                      : <>To&apos;lash: {formatPrice(advance)} so&apos;m</>}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          )}
        </>
      ) : isVoid ? (
        /* Bekor qilingan / rad etilgan bron — QR berilmaydi. */
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertCircle size={36} className="mx-auto text-red-400 mb-3" aria-hidden="true" />
          <h2 className="text-lg font-bold mb-1.5">
            {booking.rejectionReason ? 'Bu bron rad etildi' : 'Bu bron bekor qilingan'}
          </h2>
          {booking.rejectionReason && (
            <p className="text-sm text-red-300 mb-3">
              Sabab: <span className="font-semibold">{booking.rejectionReason}</span>
            </p>
          )}
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
/** To'lov usuli -> ilovaga o'tish havolasi (appUrl bo'sh bo'lsa zaxira). */
const CARD_APP_URL: Record<string, string> = {
  UZUM: 'https://www.uzumcheckout.uz',
  PAYME: 'https://payme.uz',
  CLICK: 'https://click.uz',
  PAYNET: 'https://paynet.uz',
  TRANSFER: '',
};

/**
 * Karta paneli — mijoz to'lov usulini tanlagach DARHOL ko'radi:
 * raqam + nusxalash + bank/egasi + ilovaga o'tish + izoh. To'lovni
 * yaratishni kutmaydi (eski xatolik — karta faqat to'lov yaratilgandan
 * keyin chiqar edi, yoki umuman chiqmas edi).
 */
function CardPreviewCard({ card, method, amount }: { card: MerchantCard; method: string; amount: number }) {
  const [copied, setCopied] = useState(false);
  const ui = PROVIDER_UI[method];
  const appUrl = card.appUrl || CARD_APP_URL[method];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.number.replace(/\s+/g, ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloklangan — foydalanuvchi qo'lda ko'chiradi */
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 surface p-5 mb-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 shrink-0">
            <ProviderLogo method={method} size={22} />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white truncate">{ui?.label || 'Karta'} orqali to&apos;lov</h3>
            <p className="text-xs text-gray-500">To&apos;lov shu kartaga o&apos;tkaziladi</p>
          </div>
        </div>
        <span className="shrink-0 px-2.5 py-1 text-[10px] font-bold rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan">
          DOGAON KARTA
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] p-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Bank karta raqami</div>
          <div className="text-xl sm:text-2xl font-black tracking-wider text-white tabular-nums">
            {card.numberFormatted || card.number}
          </div>
          {card.holder && (
            <div className="mt-2 text-sm font-semibold text-gray-200 uppercase tracking-wide">{card.holder}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl neon-btn font-bold text-sm"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Nusxalandi' : 'Raqamni nusxalash'}
          </button>
          {appUrl && (
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/15 text-sm font-semibold text-gray-200 hover:border-white/35 hover:text-white transition-colors"
            >
              <ExternalLink size={15} />
              {ui?.label || 'Ilovada'} o&apos;tib to&apos;lash
            </a>
          )}
        </div>
      </div>

      {(card.bank || card.note) && (
        <div className="mt-3 space-y-1">
          {card.bank && <p className="text-xs text-gray-400"><span className="text-gray-500">Bank:</span> {card.bank}</p>}
          {card.note && (
            <p className="text-xs text-amber-300/90 flex items-start gap-1">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> {card.note}
            </p>
          )}
        </div>
      )}

      <ul className="mt-4 space-y-1.5 text-xs text-gray-400 list-disc pl-4">
        <li>Raqamni nusxalang yoki «{ui?.label || 'ilovada'} o&apos;tib to&apos;lash» tugmasini bosing</li>
        <li>Kartaga <b className="text-gray-200">{formatPrice(amount)} so&apos;m</b> o&apos;tkazing</li>
        <li>Pastdagi «To&apos;lovni boshlash» tugmasi orqali chek raqami olinadi, so&apos;ng chek (screenshot) yuklanadi</li>
        <li>Admin bank hisobida tekshirib tasdiqlaydi — bron shundan keyin kuchga kiradi</li>
      </ul>
    </div>
  );
}
