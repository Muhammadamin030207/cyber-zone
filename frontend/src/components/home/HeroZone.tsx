'use client';

import { useEffect, useState } from 'react';
import { Bebas_Neue, Share_Tech_Mono } from 'next/font/google';
import {
  ArrowRight,
  Zap,
  Monitor,
  CreditCard,
  ShieldCheck,
  ScanFace,
  MapPin,
  Star,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { formatPriceShort, toNumber } from '@/lib/utils';
import type { Room } from '@/lib/types';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const techMono = Share_Tech_Mono({ weight: '400', subsets: ['latin'], variable: '--font-tech-mono' });

/** Ishonch belgilari — haqiqiy imkoniyatlar, soxta raqam emas. */
const TRUST = [
  { icon: Zap, label: 'Real-time bron' },
  { icon: Monitor, label: "Ko'plab o'yin zonalari" },
  { icon: CreditCard, label: "Xavfsiz onlayn to'lov" },
  { icon: ShieldCheck, label: 'Kamera orqali tasdiqlash' },
];

function zonePrice(zones: Room['zones']): number {
  const prices = (zones ?? [])
    .map((z) => toNumber(z.pricePerHour))
    .filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : NaN;
}

/** Xonaning birinchi mavjud kompyuteridan real spec-larni yig'adi. */
function roomSpecs(room: Room): string[] {
  const out: string[] = [];
  for (const z of room.zones ?? []) {
    for (const c of z.computers ?? []) {
      const gpu = c.specs?.gpu;
      const ram = c.specs?.ram;
      if (typeof gpu === 'string' && gpu.trim()) out.push(gpu.trim());
      if (typeof ram === 'string' && ram.trim()) out.push(ram.trim());
      if (out.length >= 2) return out;
    }
  }
  return out;
}

/**
 * Bosh sahifa hero — PREMIUM DARK LANDING.
 *
 * Chapda: aniq xabarlashgan sarlavha + kuchli bron CTA + ishonch chiplari.
 * O'ngda: LIVE jonli karta — FAQAT haqiqiy API (`GET /api/rooms`) ma'lumoti.
 *
 * QOIDA: hech qanday raqam yasalmaydi. Ma'lumot yuklanmasa — skeleton,
 * xato bo'lsa — aniq error holati (soxta "yuklanmoqda" yo'q).
 */
export default function HeroZone() {
  const user = useAuthStore((s) => s.user);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get('/api/rooms')
      .then(({ data }: { data: { data?: unknown; message?: string; [k: string]: unknown } }) => {
        if (!active) return;
        const rows = data?.data ?? data;
        if (!Array.isArray(rows)) {
          setRooms([]);
          return;
        }
        setRooms(rows.filter((r) => r.status === 'ACTIVE'));
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setRooms([]);
        setError(msg || 'Malumot yuklanmadi. Qayta urinib ko‘ring.');
      });
    return () => {
      active = false;
    };
  }, []);

  // LIVE karta uchun eng yaxshi xona (reyting bo'yicha, real ma'lumot).
  const best = rooms && rooms.length > 0
    ? [...rooms].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))[0]
    : null;
  const bestPrice = best ? zonePrice(best.zones) : NaN;
  const specs = best ? roomSpecs(best) : [];
  const computersCount = best
    ? (best._count?.computers ?? ((best.zones ?? []).reduce((s, z) => s + (z.computers?.length ?? 0), 0) || null))
    : null;

  const dashboardHref =
    user?.role === 'USER'
      ? '/dashboard'
      : user?.role === 'SUPER_ADMIN'
        ? '/super-admin'
        : '/admin';

  return (
    <div className={cn('relative w-full', bebas.variable, techMono.variable)}>
      <section
        aria-label="CYBER-ZONE — kompyuter xonalar platformasi"
        className="relative w-full overflow-hidden"
      >
        {/* Yumshoq apelsin nuri + yengil grid — bir marta, kamtarona */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 75% at 16% -12%, color-mix(in srgb, var(--acc-a) 17%, transparent) 0%, transparent 60%), radial-gradient(80% 55% at 100% 4%, color-mix(in srgb, var(--acc-b) 10%, transparent) 0%, transparent 55%)',
          }}
        />

        <div
          className={cn(
            'cz-shell relative z-10 grid min-w-0 items-center gap-[var(--ad-gap)]',
            'pt-[calc(var(--shell-pad)*1.35)] pb-[calc(var(--ad-gap)*1.6)]',
            'md:gap-10',
            'min-[1024px]:grid-cols-[1.12fr_0.88fr] min-[1024px]:gap-14',
            'min-[1280px]:grid-cols-[1.16fr_0.84fr] min-[1280px]:gap-16 min-[1280px]:pt-24 min-[1280px]:pb-24'
          )}
        >
          {/* ---------- CHAP: matn + CTA ---------- */}
          <div className="min-w-0">
            <p className="cz-tag mb-4">
              <span aria-hidden className="cz-dot animate-pulse" />
              Toshkent — yagona o‘yin maydoni
            </p>

            <h1 className="cz-display-1 font-bebas max-w-[14ch] text-[var(--fg)]">
              O&apos;YINNI BOSHLASH
              <span className="mt-1 block text-[var(--acc-a)]">VAQTI.</span>
            </h1>

            <p className="mt-5 max-w-[50ch] text-[length:var(--ad-body)] leading-relaxed text-[var(--fg-mut)]">
              Toshkentdagi kompyuter xonalarini toping, joyingizni tanlang va
              bir necha soniyada bron qiling.
            </p>

            {/* CTA — mobilda to'liq kenglik */}
            <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/rooms"
                aria-label="Hozir joy bron qilish"
                className="cz-btn cz-btn--cta cz-btn--block-mobile"
              >
                HOZIR JOY BRON QILISH <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link
                href="/rooms"
                className="cz-btn cz-btn--secondary cz-btn--block-mobile"
              >
                XONALARNI KO‘RISH
              </Link>
            </div>

            {/* Ishonch chiplari */}
            <ul className="mt-8 flex flex-wrap items-center gap-2">
              {TRUST.map((f) => (
                <li
                  key={f.label}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-[var(--fg-mut)]"
                >
                  <f.icon size={12} className="text-[var(--acc-a)]" aria-hidden="true" />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          {/* ---------- O'NG: LIVE karta (FAQAT real ma'lumot) ---------- */}
          <div className="min-w-0 md:mt-8 min-[1024px]:mt-0">
            {rooms === null ? (
              /* Yuklanish: skeleton (soxta raqamlar YO'Q) */
              <div
                className="cz-card cz-card--status cz-card--room"
                aria-label="Yuklanmoqda"
                role="status"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="h-4 w-24 animate-pulse rounded bg-white/10" />
                  <span className="h-4 w-4 animate-pulse rounded-full bg-white/10" />
                </div>
                <div className="mt-6 h-10 w-40 animate-pulse rounded bg-white/10" />
                <div className="mt-3 h-4 w-48 animate-pulse rounded bg-white/10" />
                <div className="mt-6 flex gap-2">
                  <span className="h-5 w-16 animate-pulse rounded-full bg-white/10" />
                  <span className="h-5 w-16 animate-pulse rounded-full bg-white/10" />
                </div>
                <div className="mt-6 h-11 w-full animate-pulse rounded-xl bg-white/10" />
              </div>
            ) : error && rooms.length === 0 ? (
              /* Aniq xato holati */
              <div
                className="cz-card cz-card--status cz-card--room"
                role="alert"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="cz-tag">Jonli holat</span>
                  <ScanFace size={16} className="text-[var(--acc-a)]" aria-hidden="true" />
                </div>
                <p className="mt-5 text-sm text-[var(--fg-mut)]">{error}</p>
                <Link href="/rooms" className="cz-btn cz-btn--primary mt-6 w-full">
                  Xonalarni ko‘rish <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            ) : !best ? (
              /* Bo'sh holat — "0" yoki soxta raqam ko'rsatilmaydi */
              <div className="cz-card cz-card--status cz-card--room">
                <div className="flex items-center justify-between gap-3">
                  <span className="cz-tag">Jonli holat</span>
                  <ScanFace size={16} className="text-[var(--acc-a)]" aria-hidden="true" />
                </div>
                <p className="mt-5 text-sm text-[var(--fg-mut)]">
                  Hozircha faol xonalar e’lon qilinmagan.
                </p>
                <Link href="/rooms" className="cz-btn cz-btn--primary mt-6 w-full">
                  Xonalarni ko‘rish <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            ) : (
              /* REAL LIVE karta */
              <div className="cz-card cz-card--status cz-card--room">
                <div className="flex items-center justify-between gap-3">
                  <span className="cz-tag">
                    <span aria-hidden className="cz-dot animate-pulse" />
                    LIVE — jonli holat
                  </span>
                  <ScanFace size={16} className="text-[var(--acc-a)]" aria-hidden="true" />
                </div>

                <h2 className="mt-5 font-bebas text-3xl leading-none tracking-wide text-[var(--fg)]">
                  {best.name}
                </h2>

                <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--fg-dim)]">
                  <MapPin size={11} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{best.district || best.address}</span>
                  {best.avgRating ? (
                    <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-[var(--acc-c)]">
                      <Star size={10} aria-hidden="true" className="fill-current" />
                      {best.avgRating.toFixed(1)}
                    </span>
                  ) : null}
                </p>

                {/* Real narx + kompyuterlar */}
                <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {Number.isFinite(bestPrice) ? (
                    <p className="text-sm text-[var(--fg)]">
                      <b className="font-bebas text-2xl tracking-wide text-[var(--acc-a)]">
                        {formatPriceShort(bestPrice)}
                      </b>{' '}
                      so‘m / soat
                    </p>
                  ) : null}
                  {computersCount !== null ? (
                    <p className="text-xs text-[var(--fg-mut)]">
                      {computersCount} ta kompyuter
                    </p>
                  ) : null}
                </div>

                {/* Real spec chiplari */}
                {specs.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {specs.map((s) => (
                      <li
                        key={s}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--fg-mut)]"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-6 flex flex-col gap-2.5">
                  <Link href={`/rooms/${best.id}`} className="cz-btn cz-btn--primary w-full">
                    JOYNI TANLASH <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    href={user ? dashboardHref : '/login'}
                    className="cz-btn cz-btn--secondary w-full"
                  >
                    {user ? 'Kabinetga o‘tish' : "Kirish / Ro'yxatdan o'tish"}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}