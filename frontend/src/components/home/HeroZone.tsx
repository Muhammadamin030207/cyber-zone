'use client';

import { useEffect, useState } from 'react';
import { Bebas_Neue, Share_Tech_Mono } from 'next/font/google';
import {
  ArrowRight,
  Monitor,
  Newspaper,
  Zap,
  CreditCard,
  ShieldCheck,
  ScanFace,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const techMono = Share_Tech_Mono({ weight: '400', subsets: ['latin'], variable: '--font-tech-mono' });

const FEATURES = [
  { icon: Zap, label: 'Yuqori tezlik' },
  { icon: Monitor, label: 'Istalgan xona' },
  { icon: CreditCard, label: "Onlayn to'lov" },
  { icon: ShieldCheck, label: 'Kamerali sessiya tekshiruvi' },
];

/**
 * Bosh sahifa hero — CYBER-ZONE.
 *
 * 4 ta ART DIRECTION bitta komponentda (sahifa 4 marta yozilmaydi):
 *   DESKTOP 1280+      "CYBER COMMAND CENTER" — asimmetrik, keng chap ustun
 *   LAPTOP  1024-1279  "NEON TERMINAL"        — 55/45 ixcham, texnik
 *   TABLET  768-1023   "CYBER HUD"            — ustma-ust, yaxlitirilgan panellar
 *   MOBILE  <=767      "NEON MOBILE COMMAND"  — vertikal storytelling
 *
 * Eski holatda markazlashgan bitta kompozitsiya barcha kengliklarda
 * ishlatilardi, orqasida 18vw "CYBER-ZONE" suv oltini bor edi.
 * Endi har viewport o'z kompozitsiyasini oladi.
 *
 * QOIDA: hech qanday raqam yasalmaydi. Yagona raqam — `GET /api/rooms`
 * dan keladigan jonli xona soni.
 */
export default function HeroZone() {
  const user = useAuthStore((s) => s.user);
  const [roomsCount, setRoomsCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get('/api/rooms')
      .then(({ data }: { data: { data?: unknown; [k: string]: unknown } }) => {
        const rows = data?.data ?? data;
        if (active && Array.isArray(rows) && rows.length > 0) setRoomsCount(rows.length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
        {/* Subtle radial glow — bir marta, juda yumshoq */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 70% at 18% -10%, color-mix(in srgb, var(--acc-a) 20%, transparent) 0%, transparent 58%), radial-gradient(90% 60% at 100% 8%, color-mix(in srgb, var(--acc-b) 14%, transparent) 0%, transparent 55%)',
          }}
        />
        {/* Yengil grid — faqat yuqorida, pastga yokiq holda */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(to right, color-mix(in srgb, var(--acc-a) 40%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--acc-a) 40%, transparent) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'linear-gradient(to bottom, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
          }}
        />

        {/* ============ 4 ART DIRECTION kompozitsiyasi ============
            MOBILE/TABLET: bitta ustun (vertikal storytelling)
            LAPTOP:  55 / 45
            DESKTOP: 1.18fr / 0.82fr — kengroq asimmetriya, ko'proq bo'shliq
        */}
        <div
          className={cn(
            'relative z-10 mx-auto grid w-full min-w-0 max-w-[1280px] items-center gap-[var(--ad-gap)] px-4 sm:px-6',
            'pt-[calc(var(--shell-pad)*1.5)] pb-[calc(var(--ad-gap)*1.5)]',
            'md:gap-8',
            'lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-14'
          )}
        >
          {/* ---------- LEFT: matn + CTA ---------- */}
          <div className="min-w-0">
            <p className="cz-tag mb-4">
              <span aria-hidden className="cz-dot" />
              CYBER-ZONE — kompyuter xonalar platformasi
            </p>

            <h1 className="cz-display-1 font-bebas max-w-[14ch] text-[var(--fg)]">
              O&apos;YIN UCHUN JOY.
              <span className="mt-1 block text-[var(--acc-a)]">
                SEN UCHUN TAYYAR.
              </span>
            </h1>

            <p className="mt-5 max-w-[52ch] text-[length:var(--ad-body)] leading-relaxed text-[var(--fg-mut)]">
              Toshkent bo&apos;ylab kompyuter xonalari bitta platformada — solishtiring,
              o&apos;rin bron qiling va to&apos;lovni onlayn rasmiylashtiring. Sessiyani
              boshlashdan oldin kamera orqali o&apos;zligingizni tasdiqlaysaniz.
            </p>

            {/* CTA — mobilda to'liq kenglik, desktopda yonma-yon */}
            <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/rooms"
                aria-label="Xonalarni ko'rish"
                className="cz-btn cz-btn--cta cz-btn--block-mobile"
              >
                Xonalarni ko&apos;rish <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link
                href={user ? dashboardHref : '/login'}
                className="cz-btn cz-btn--secondary cz-btn--block-mobile"
              >
                {user ? 'Kabinetga o\u2018tish' : "Kirish / Ro'yxatdan o'tish"}
              </Link>
            </div>

            {/* Texnik xususiyat chiplari */}
            <ul className="mt-8 flex flex-wrap items-center gap-2">
              {FEATURES.map((f) => (
                <li
                  key={f.label}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--fg-mut)]"
                >
                  <f.icon size={12} className="text-[var(--acc-a)]" aria-hidden="true" />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          {/* ---------- RIGHT: jonli holat vizuali ----------
              MOBILE: pastda (vertikal)
              LAPTOP/DESKTOP: o'ng ustunda
              Bu blok FAQAT real API dan kelgan raqamni ko'rsatadi. */}
          <div className="min-w-0 md:mt-10 lg:mt-0">
            <div className="cz-card cz-card--status cz-card--room">
              <div className="flex items-center justify-between gap-3">
                <span className="cz-tag">
                  <span aria-hidden className="cz-dot animate-pulse" />
                  Jonli holat
                </span>
                <ScanFace size={16} className="text-[var(--acc-a)]" aria-hidden="true" />
              </div>

              <p className="mt-5 flex items-baseline gap-2">
                <span className="font-bebas text-5xl leading-none tracking-wide text-[var(--fg)]">
                  {roomsCount === null ? '—' : roomsCount}
                </span>
                <span className="text-sm text-[var(--fg-mut)]">
                  {roomsCount === null ? 'yuklanmoqda' : 'ta xona'}
                </span>
              </p>
              <p className="mt-2 text-sm text-[var(--fg-dim)]">
                Platformadagi barcha xonalar — narx, zona va bo&apos;sh vaqt
                bilan birga.
              </p>

              <div className="mt-6 flex flex-col gap-2.5">
                <Link href="/rooms" className="cz-btn cz-btn--primary w-full">
                  Bo&apos;sh joyni top <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  href="/news"
                  className="cz-btn cz-btn--secondary w-full"
                >
                  <Newspaper size={15} aria-hidden="true" /> Yangiliklar va aksiyalar
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
