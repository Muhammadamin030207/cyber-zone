'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, CheckCircle2, CreditCard, Wallet, Banknote, Smartphone, AlertCircle,
  ArrowRight, Landmark, BadgePercent, Clock, MapPin, Monitor, ChevronLeft, X, ShieldCheck, Zap,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Booking } from '@/lib/types';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import TicketQR from '@/components/booking/TicketQR';
import SplashLoader from '@/components/ui/SplashLoader';

type PayMethod = 'PAYME' | 'CLICK' | 'UZCARD' | 'HUMO' | 'UZUM' | 'CASH';

const METHODS: { id: PayMethod; label: string; sub: string; icon: any; color: string; demoCard: string }[] = [
  { id: 'PAYME', label: 'Payme', sub: 'Telefon ilovasi', icon: Smartphone, color: 'bg-[#00C7F0]/10 text-[#22d3ee] border-[#00C7F0]/30', demoCard: '8600 0119 5555 2000' },
  { id: 'CLICK', label: 'Click', sub: 'Tez va oson', icon: Zap, color: 'bg-[#ED1C24]/10 text-[#ff5a60] border-[#ED1C24]/30', demoCard: '8600 0490 1234 5678' },
  { id: 'UZUM', label: 'Uzum Bank', sub: 'Raqamli bank', icon: Wallet, color: 'bg-[#7000FF]/15 text-[#a86bff] border-[#7000FF]/40', demoCard: '9860 2090 8899 7766' },
  { id: 'UZCARD', label: 'Uzcard', sub: 'Bank kartasi', icon: CreditCard, color: 'bg-[#2456A6]/10 text-[#4f83c9] border-[#2456A6]/40', demoCard: '8600 0030 1122 3344' },
  { id: 'HUMO', label: 'Humo', sub: 'Bank kartasi', icon: CreditCard, color: 'bg-[#0066B3]/10 text-[#3b9be0] border-[#0066B3]/40', demoCard: '9860 0101 2233 4455' },
  { id: 'CASH', label: 'Kassada', sub: '30% joyida to\'lash', icon: Banknote, color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', demoCard: '' },
];

export default function CheckoutPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  void params;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<PayMethod>('PAYME');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [cashNotified, setCashNotified] = useState(false);
  const [appModal, setAppModal] = useState<PayMethod | null>(null);
  const [modalSuccess, setModalSuccess] = useState(false);

  useEffect(() => {
    api
      .get(`/api/bookings/${id}`)
      .then(({ data }) => {
        const b = data.data as Booking;
        setBooking(b);
        if (b.status === 'CONFIRMED' || b.status === 'ACTIVE') setPaid(true);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  async function payNow() {
    if (!booking) return;
    setPaying(true);
    setError(null);
    try {
      const amount = Number(booking.advanceAmount);

      if (method === 'CASH') {
        await api.post('/api/payments/create', {
          bookingId: booking.id,
          amount,
          method: 'CASH',
        });
        setCashNotified(true);
      } else {
        const { data } = await api.post('/api/payments/create', {
          bookingId: booking.id,
          amount,
          method,
        });
        const paymentId = data.data?.id;
        await api.post(`/api/payments/${paymentId}/pay`, {
          cardNumber,
          cardHolder,
        });
        setBooking({ ...booking, status: 'CONFIRMED' });
        setPaid(true);
        setModalSuccess(true);
        setTimeout(() => {
          setAppModal(null);
          setModalSuccess(false);
        }, 1400);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'To\'lovda xatolik yuz berdi'));
    } finally {
      setPaying(false);
    }
  }

  function openApp(m: PayMethod, cardHolderName: string) {
    const meta = METHODS.find((x) => x.id === m);
    setCardNumber(meta?.demoCard || '');
    setCardHolder(cardHolderName);
    setModalSuccess(false);
    setAppModal(m);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <SplashLoader label="Bron yuklanmoqda..." />
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
        <p className="text-gray-300">{error}</p>
        <Link href="/rooms" className="inline-block mt-4 text-neon-cyan hover:underline">Xonalar</Link>
      </div>
    );
  }
  if (!booking) return null;

  const isPending = booking.status === 'PENDING';
  const advance = Number(booking.advanceAmount);
  const remaining = Number(booking.remainingAmount);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 pb-24">
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-5"
      >
        <ChevronLeft size={16} /> Kabinetga qaytish
      </button>

      <h1 className="text-2xl font-extrabold tracking-tight mb-1">To'lov</h1>
      <p className="text-gray-400 text-sm mb-6">Broningizni tasdiqlash uchun 30% oldindan to'lov</p>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {cashNotified && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
          <Wallet size={16} />
          Ruxsat berildi: 30% ini kassada to'laysiz. Admin xabarnoma oldi va bronni tasdiqlaydi. Bronni kuzatish: <Link href="/dashboard" className="underline">Kabinet</Link>
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
            booking.status === 'CONFIRMED' ? 'bg-neon-green/15 text-neon-green border-neon-green/30'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/30')}>
            {booking.status === 'CONFIRMED' ? 'Tasdiqlandi' : 'To\'lov kutilmoqda'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2 text-gray-300">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} /> Sana</span>
            {formatDate(booking.date)} · {booking.startTime}—{booking.endTime}
          </div>
          <div className="rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2 text-gray-300">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Monitor size={11} /> Kompyuter</span>
            {booking.computer?.name || 'Avtomatik'}
          </div>
        </div>

        <div className="h-px bg-white/5 my-3" />

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Umumiy summa</span>
            <span>{formatPrice(booking.finalPrice)} so'm</span>
          </div>
          {Number(booking.discountAmount) > 0 && (
            <div className="flex justify-between text-neon-green">
              <span className="flex items-center gap-1"><BadgePercent size={12} /> Chegirma</span>
              <span>-{formatPrice(booking.discountAmount)} so'm</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg">
            <span>30% oldindan</span>
            <span className="neon-text">{formatPrice(advance)} so'm</span>
          </div>
          <div className="flex justify-between text-gray-400 text-xs">
            <span>Qolgan 70% (joyda)</span>
            <span>{formatPrice(remaining)} so'm</span>
          </div>
        </div>
      </div>

      {isPending ? (
        <>
          {/* To'lov usulini tanlash */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-3.5 rounded-xl border text-center transition-colors',
                  method === m.id
                    ? 'border-neon-cyan/50 bg-neon-cyan/10'
                    : 'border-white/10 bg-cyber-900 hover:border-white/20'
                )}
              >
                <span className={cn('p-2 rounded-lg border', m.color)}>
                  <m.icon size={18} />
                </span>
                <span className="text-sm font-semibold">{m.label}</span>
                <span className="text-[10px] text-gray-500">{m.sub}</span>
              </button>
            ))}
          </div>

          {method !== 'CASH' ? (
            <div className="neo-card rounded-2xl p-5 mb-5 flex items-center gap-4">
              <span className={cn('p-3 rounded-xl border shrink-0', METHODS.find((m) => m.id === method)?.color)}>
                <Wallet size={22} />
              </span>
              <div>
                <h3 className="font-semibold text-sm">{METHODS.find((m) => m.id === method)?.label} ilovasida to\'lash</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Karta raqami va summa avtomatik to'ldiriladi — siz faqat tasdiqlaysiz
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-200 mb-5">
              <p className="flex items-center gap-2 font-semibold">
                <Banknote size={16} /> 30% ini kassada to'laysiz
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                Bron davomida qolgan 70% ni ham kassada to'lashingiz mumkin. Admin sizning broningizni kassada to'lov qabul qilgandan so'ng tasdiqlaydi.
              </p>
            </div>
          )}

          <button
            onClick={() => (method === 'CASH' ? payNow() : openApp(method, user?.fullName?.toUpperCase() || ''))}
            disabled={paying}
            className="w-full py-3.5 rounded-xl neon-btn flex items-center justify-center gap-2 font-bold disabled:opacity-40"
          >
            {paying ? (
              <><Loader2 size={18} className="animate-spin" /> To'lanmoqda...</>
            ) : (
              <>
                {method === 'CASH' ? 'Kassada to\'layman' : <>To'lash: {formatPrice(advance)} so'm</>}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </>
      ) : (
        <>
          {paid && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neon-green/10 border border-neon-green/30 text-sm text-neon-green">
              <CheckCircle2 size={16} /> To'lov muvaffaqiyatli. Broningiz tasdiqlandi!
            </div>
          )}
          <TicketQR booking={booking} userName={user?.fullName} />
          <Link
            href="/dashboard"
            className="mt-4 w-full block text-center py-3.5 rounded-xl neon-btn font-bold"
          >
            Qolgan 70% joyda — Kabinetga o'tish
          </Link>
        </>
      )}

      {/* ===== To'lov-app simulyatsiya modali ===== */}
      {appModal && booking && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          {modalSuccess ? (
            <div className="neo-card rounded-3xl w-full max-w-sm p-10 text-center animate-float">
              <CheckCircle2 size={64} className="mx-auto text-neon-green mb-4" />
              <h3 className="text-xl font-bold mb-1">To'lov amalga oshdi!</h3>
              <p className="text-sm text-gray-400">Broningiz tasdiqlandi. Tilakda!</p>
            </div>
          ) : (
            <div className="neo-card rounded-3xl w-full max-w-sm overflow-hidden">
              {/* App header */}
              <div className={cn('p-4 flex items-center gap-3', METHODS.find((m) => m.id === appModal)?.color as any)}>
                <span className="p-2.5 rounded-xl bg-black/20">
                  {METHODS.find((m) => m.id === appModal)?.icon && (() => {
                    const Ico = METHODS.find((m) => m.id === appModal)!.icon;
                    return <Ico size={24} />;
                  })()}
                </span>
                <div className="flex-1">
                  <p className="font-bold leading-tight">{METHODS.find((m) => m.id === appModal)?.label} · {formatPrice(advance)} so\'m</p>
                  <p className="text-xs opacity-80 flex items-center gap-1"><ShieldCheck size={11} /> Ilovada tasdiqlang</p>
                </div>
                <button onClick={() => setAppModal(null)} className="p-1.5 rounded-lg bg-black/20 hover:bg-black/30">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-3">
                  <Landmark size={11} /> QUVVATCHI · Cyber-ZONE
                </p>

                <div className="rounded-xl bg-cyber-800/60 border border-white/5 px-4 py-3 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-gray-500">To\'lov summasi</p>
                    <p className="text-2xl font-extrabold neon-text">{formatPrice(advance)} so\'m</p>
                  </div>
                  <Smartphone size={22} className="text-gray-500" />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Karta raqami</label>
                    <input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '))}
                      placeholder="8600 0000 0000 0000"
                      inputMode="numeric"
                      className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none tracking-wider"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Karta egasi</label>
                    <input
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      placeholder="ISMLA KARIMOVA"
                      className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={payNow}
                  disabled={paying || cardNumber.replace(/\D/g, '').length < 16}
                  className="w-full mt-5 py-3 rounded-xl neon-btn flex items-center justify-center gap-2 font-bold disabled:opacity-40"
                >
                  {paying ? <><Loader2 size={18} className="animate-spin" /> To'lanmoqda...</> : <><ShieldCheck size={18} /> Tasdiqlash va to\'lash</>}
                </button>
                <p className="text-center text-[10px] text-gray-600 mt-2">Ushbu to\'lov simulyatsiya — real mablag\' yechilmaydi</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}