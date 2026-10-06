'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Play, Square, Timer, Clock, Loader2, AlertCircle, CheckCircle2, Wallet, Camera,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { confirmDialog } from '@/lib/confirm';
import { toastSuccess } from '@/lib/toast';
import type { Booking, BookingSessionState } from '@/lib/types';
import { formatPrice, cn } from '@/lib/utils';

// Kamerali liveness faqat mijoz qurilmasida ishlaydi — SSR'da chop etmaymiz.
const FaceCheck = dynamic(() => import('./FaceCheck'), { ssr: false });

function fmtClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** ACTIVE bron uchun sessiya boshqaruvi: jonli xronometr + check-in/check-out. */
export default function SessionController({
  booking,
  refresh,
}: {
  booking: Booking;
  refresh: () => void;
}) {
  const [session, setSession] = useState<BookingSessionState | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `now` — lokal soat (interval to'ldiradi). Boshlang'ich qiymat 0: render
  // paytida `Date.now()` chaqirish noto'g'ri (purity). 0 bo'lganda xronometr
  // server qiymatini (`session.elapsedMinutes`) ko'rsatadi — bu ham aniqroq.
  const [now, setNow] = useState<number>(0);
  const [busy, setBusy] = useState(true);
  const [showFace, setShowFace] = useState(false);

  const isActive = booking.status === 'ACTIVE' && !!booking.sessionStartedAt;
  // UNLIMITED: taymer yo'q — countdown ko'rsatilmaydi, faqat o'tgan vaqt.
  const unlimited = session?.unlimited === true || booking.sessionType === 'UNLIMITED';
  // Kamerali yuz tekshiruvi: server esgi `faceCheckRequired` (SiteSetting) bo'yicha.
  const faceRequired = session?.faceCheckRequired === true;
  const faceVerified = session?.faceVerified === true;
  // Provider serverda sozlanganmi? `false` bo'lsa tekshiruvni talab qilib
  // ko'rsatib, keyin "mavjud emas" degan xato berish o'rniga — to'g'ridan-to'g'ri
  // tushuntirishni ko'rsatamiz (tuzoq bo'lmagan, halokatli UX yo'q).
  const faceAvailable = session?.faceCheckAvailable === true;
  const faceBlocked = faceRequired && !faceVerified && !faceAvailable;

  async function fetchSession(silent = false) {
    try {
      const { data } = await api.get(`/api/bookings/${booking.id}/session`);
      setSession(data.data?.session || null);
      setBusy(false);
    } catch (err) {
      if (!silent) setError(getApiErrorMessage(err));
      setBusy(false);
    }
  }

  // Jonli soat (server qaytargan boshlanishdan hisoblanadi) — 1 soniyada yangilanadi
  useEffect(() => {
    fetchSession();
    const ti = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ti);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  // ACTIVE bo'lganda sessiya holatini dolzarb ushlab turamiz
  useEffect(() => {
    if (!isActive) return;
    const f = () => fetchSession(true);
    const id = setInterval(f, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  async function start() {
    if (!(await confirmDialog({
      title: 'Sessiyani boshlash',
      message: 'Check-in? Kompyuter band qilinadi va hisob boshlanadi (min 1 soat).',
      confirmLabel: 'Boshlash',
    }))) return;
    // Yuz tekshiruvi hali o'tilmagan va talab yoqilgan bo'lsa — kameraga yuboramiz.
    // Provider serverda yo'q bo'lsa — BAZADA ENFORCEMENT YO'Q (NOT_CONFIGURED).
    // Shuning uchun kamera ochmaymiz va to'g'ridan-to'g'ri boshlaymiz (bloklamaymiz).
    if (faceRequired && !faceVerified) {
      if (faceAvailable) {
        setShowFace(true);
        return;
      }
      // faceRequired true lekin faceAvailable false -> NOT_CONFIGURED: blok EMAS,
      // shunchaki ogohlantirish ko'rsatib davom etamiz
      setError('Face Verification hozircha sozlanmagan — sessiya bloklanmasdan boshlanadi.');
      await doStart();
      return;
    }
    await doStart();
  }

  async function doStart() {
    setActing(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/bookings/${booking.id}/session/start`);
      setSession(data.data?.session || null);
      toastSuccess('Sessiya boshlandi');
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Sessiyani boshlashda xatolik'));
    } finally {
      setActing(false);
    }
  }

  async function end() {
    if (!(await confirmDialog({
      title: 'Sessiyani yakunlash',
      message: 'Check-out? Haqiqiy foydalanish bo\u2018yicha hisob qilinadi (min 1 soat).',
      confirmLabel: 'Yakunlash',
      danger: true,
    }))) return;
    setActing(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/bookings/${booking.id}/session/end`);
      setSession(data.data?.session || null);
      const s = data.data?.session;
      if (s?.refundPoints > 0) {
        toastSuccess(`${s.refundPoints.toLocaleString('ru-RU')} ball qaytarildi`);
      } else if (s?.extraDue > 0) {
        toastSuccess('Qo\u2018shimcha to\u2018lov qayd qilindi');
      } else {
        toastSuccess('Sessiya yakunlandi');
      }
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Sessiyani yakunlashda xatolik'));
    } finally {
      setActing(false);
    }
  }

  if (busy) {
    return (
      <div className="mt-4 rounded-xl border border-neon-cyan/20 bg-cyber-800/40 px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={15} className="animate-spin" /> Sessiya holati yuklanmoqda...
      </div>
    );
  }

  const startedAt = booking.sessionStartedAt ? new Date(booking.sessionStartedAt).getTime() : 0;
  // `now === 0` — interval hali ishga tushmagan; server hisobini ko'rsatamiz.
  const elapsedSec =
    isActive && startedAt && now > 0
      ? Math.floor((now - startedAt) / 1000)
      : (session?.elapsedMinutes || 0) * 60;
  const remainingSec = isActive && session && !unlimited ? Math.floor((session.remainingMs ?? 0) / 1000) : null;
  const minBill = booking.minBillingMinutes ?? 60;

  // ====== UNLIMITED: joriy (yig'ilib borayotgan) hisob =====
  // Cheksiz sessiyada mijoz BIR SOATLIK summani oldindan to'laydi, qolgani
  // sarflangan vaqt bo'yicha hisoblanadi va sessiya yopilganda qarz qilib
  // qoladi. Avval UI faqat "∞" ko'rsatardi — mijoz qancha to'lashini
  // bilmasdi va sessiya oxirida kutilmagan hisob kelib chiqardi.
  // `session.actualPrice` serverda SARFLANGAN VAQT bo'yicha har safar
  // qayta hisoblanadi (jami to'lovdan TAYIN, ya'ni brutto), shuning uchun
  // undan oldindan to'langan 1 soatni ayirib, "qolgan" qarzni ko'rsatamiz.
  const accruedGross = session?.actualPrice ?? null;
  const prepaid = session?.prepaidValue ?? 0;
  const accruedDue =
    unlimited && accruedGross !== null ? Math.max(0, Math.round((accruedGross - prepaid) / 100) * 100) : null;

  return (
    <div className="mt-4 rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neon-cyan/15">
        <span className="text-xs font-bold uppercase tracking-wider text-neon-cyan flex items-center gap-1.5">
          <Timer size={13} /> Jonli sessiya
        </span>
        <span className={cn(
          'flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border',
          isActive
            ? 'text-neon-green border-neon-green/40 bg-neon-green/10'
            : 'text-gray-400 border-white/10 bg-cyber-800/50'
        )}>
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />}
          {isActive ? (unlimited ? 'CHEKSIZ' : 'FAOL') : 'BOSHQA'}
        </span>
      </div>

      <div className="p-4">
        {error && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {isActive ? (
          <div className="space-y-3">
<div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">O&apos;tgan vaqt</p>
                  <p className="font-mono text-3xl font-extrabold text-neon-cyan leading-none tabular-nums">{fmtClock(elapsedSec)}</p>
                </div>
                {unlimited ? (
                  <div className="text-right text-xs text-gray-400">
                    <p className="flex items-center justify-end gap-1"><Clock size={11} /> Cheksiz sessiya</p>
                    <p className="font-mono text-sm font-bold tabular-nums text-neon-cyan">∞</p>
                    <p className="text-[11px] text-gray-500">sarflangan vaqt bo&apos;yicha hisob</p>
                  </div>
                ) : (
                  <div className="text-right text-xs text-gray-400">
                    <p className="flex items-center justify-end gap-1"><Clock size={11} /> Qolgan (bron bo&apos;yicha)</p>
                    <p className={cn('font-mono text-sm font-bold tabular-nums', (remainingSec ?? 0) > 0 ? 'text-gray-200' : 'text-yellow-400')}>
                      {session && remainingSec !== null ? fmtClock(remainingSec) : '—'}
                    </p>
                    {remainingSec !== null && remainingSec < 0 && <p className="text-[11px] text-yellow-400">vaqt oshdi — qo&apos;shimcha hisob</p>}
                  </div>
                )}
              </div>
            {session && (
              <p className="text-[11px] text-gray-500">
                Hisob: kamida {minBill} daqiqa. Joriy hisob: {' '}
                {session.actualPrice != null ? formatPrice(session.actualPrice) : '—'} so&apos;m.
              </p>
            )}
            {unlimited && accruedDue !== null && (
              <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] text-amber-300/90">
                  Bir soat oldindan to&apos;langan. Sarflangan vaqt uchun qo&apos;shimcha{' '}
                  <span className="font-mono font-bold text-amber-200">{formatPrice(accruedDue)}</span> so&apos;m
                  {accruedDue > 0 ? (
                    <> — sessiya yopilganda kassada to&apos;lanadi.</>
                  ) : (
                    <> (hozircha qarz yo&apos;q).</>
                  )}
                </p>
              </div>
            )}
            <button
              onClick={end}
              disabled={acting}
              className="w-full py-2.5 rounded-xl border border-red-500/40 text-red-400 text-sm font-bold hover:bg-red-500/10 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {acting ? <Loader2 size={15} className="animate-spin" /> : <Square size={14} />}
              Sessiyani yakunlash (check-out)
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {session?.actualPrice != null && session.actualPrice > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Wallet size={12} />
                Haqiqiy hisob: <b className="text-neon-cyan">{formatPrice(session.actualPrice)} so&apos;m</b>
                {' '}({session.billedMinutes} daqiqa)
              </p>
            )}
            <button
              onClick={start}
              disabled={acting}
              className="w-full py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {acting ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} />}
              Sessiyani boshlash (check-in)
            </button>
            {faceRequired && !faceVerified && !isActive && (
              faceAvailable ? (
                <p className="text-[11px] text-[var(--warn)] flex items-start gap-1.5">
                  <Camera size={12} className="shrink-0 mt-0.5" />
                  <span>Avval kamerali yuz tekshiruvida {''}
                    3 marta ko&apos;z pirpirating.
                  </span>
                </p>
              ) : (
                <p className="text-[11px] text-[var(--fg-dim)] flex items-start gap-1.5">
                  <Camera size={12} className="shrink-0 mt-0.5" />
                  <span>Face Verification hozircha sozlanmagan (NOT_CONFIGURED). Sessiya bloklanmasdan boshlanadi.</span>
                </p>
              )
            )}
            <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-neon-green" />
              Check-in bilan kompyuter band qilinadi; hisob server tomonidan olib boriladi.
            </p>
          </div>
        )}
      </div>

      <FaceCheck
        open={showFace}
        bookingId={booking.id}
        onVerified={() => {
          setShowFace(false);
          void (async () => {
            await fetchSession(true);
            void refresh();
            await doStart();
          })();
        }}
        onClose={() => setShowFace(false)}
      />
    </div>
  );
}