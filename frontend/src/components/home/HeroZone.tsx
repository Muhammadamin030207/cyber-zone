'use client';

import { useEffect, useState } from 'react';
import { Bebas_Neue, Share_Tech_Mono } from 'next/font/google';
import { ArrowRight, Monitor, Newspaper, Zap, CreditCard, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const techMono = Share_Tech_Mono({ weight: '400', subsets: ['latin'], variable: '--font-tech-mono' });

const FEATURES = [
  { icon: Zap, label: 'Yuqori tezlik' },
  { icon: Monitor, label: 'Istalgan xona' },
  { icon: CreditCard, label: 'Onlayn to\'lov' },
  { icon: ShieldCheck, label: 'Liveness xavfsizlik' },
];

/**
 * Bosh sahifa hero — CYBER-ZONE brendi.
 * NEXUS emas, countdown/soat yo'q: faqat o'z nomimiz, jonli (real) xona soni
 * va bronlashga chaqiruv.
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

  return (
    <div className={cn('relative w-full', bebas.variable, techMono.variable)}>
      <section
        aria-label="CYBER-ZONE — kompyuter xonalar platformasi"
        className="relative w-full overflow-hidden bg-[var(--cz-bg,#05050f)]"
        style={{ minHeight: '58vh' }}
      >
        {/* Radial neon cyan -> magenta glow */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(130% 85% at 50% -20%, color-mix(in srgb, var(--cz-cyan, var(--acc-a)) 34%, transparent) 0%, color-mix(in srgb, var(--cz-magenta, var(--acc-b)) 22%, transparent) 42%, transparent 72%)',
          }}
        />
        {/* Ghost watermark — o'z nomimiz */}
        <span
          aria-hidden
          className="font-bebas pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[18vw] sm:text-[14vw] leading-none tracking-wide text-white/[0.04]"
        >
          CYBER-ZONE
        </span>
        {/* CRT scanlines */}
        <div aria-hidden className="scan-overlay z-[1]" />

        {/* Content */}
        <div className="relative z-10 mx-auto flex min-h-[58vh] w-full max-w-3xl flex-col items-center justify-center px-4 pb-20 pt-14 text-center sm:px-6 sm:pb-24">
          <p className="font-tech text-neon-cyan mb-3 flex items-center gap-2 text-[11px] font-normal uppercase tracking-[0.35em] sm:text-xs">
            <span aria-hidden className="animate-pulse-glow h-1.5 w-1.5 rounded-full bg-[var(--acc-a)] shadow-[0_0_8px_var(--acc-a)]" />
            CYBER-ZONE — Kompyuter xonalar platformasi
          </p>
          <h1 className="font-bebas text-[var(--fg)] text-6xl leading-[0.92] tracking-wide sm:text-7xl md:text-8xl">
            XONANGNI TANLA
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--fg-mut)] sm:text-base">
            Toshkent bo&apos;ylab kompyuter xonalari bitta platformada — solishtiring,
            o&apos;rin bron qiling va onlayn to&apos;lang. Dastlab kamerada 3 marta ko&apos;z
            pirpira<span className="text-[var(--acc-a)]">t</span>ib o&apos;zing jonli ekaningni tasdiqlaysan.
          </p>

          {/* CTA tugmalari */}
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/rooms"
              aria-label="Xonalarni ko'rish"
              className="neon-btn inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold sm:w-auto"
            >
              Xonalarni ko&apos;rish <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {user ? (
              <Link
                href={user.role === 'USER' ? '/dashboard' : user.role === 'SUPER_ADMIN' ? '/super-admin' : '/admin'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--acc-a)_35%,transparent)] surface px-6 py-3.5 text-sm font-semibold transition-colors hover:border-[var(--acc-a)] sm:w-auto"
              >
                Kabinetga o&apos;tish
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--acc-a)_35%,transparent)] surface px-6 py-3.5 text-sm font-semibold transition-colors hover:border-[var(--acc-a)] sm:w-auto"
              >
                Kirish / Ro&apos;yxatdan o&apos;tish
              </Link>
            )}
          </div>

          {/* Xususiyat chiplari */}
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {FEATURES.map((f) => (
              <li
                key={f.label}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-[var(--fg-dim)]"
              >
                <f.icon size={12} className="text-[var(--acc-a)]" aria-hidden="true" />
                {f.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== AMALIY STATUS QATORI (real xona soni) ===== */}
      <div className="relative z-20 -mt-10 px-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--acc-a)_40%,transparent)] bg-[color-mix(in_srgb,var(--bg-1)_80%,transparent)] p-4 backdrop-blur-xl shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_6%,transparent),0_24px_50px_-32px_rgba(0,0,0,0.9)] sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="animate-pulse-glow h-2 w-2 shrink-0 rounded-full bg-[var(--acc-a)] shadow-[0_0_8px_var(--acc-a)]"
              />
              <span className="font-tech text-[var(--fg-mut)] text-[10px] uppercase tracking-[0.3em] sm:text-[11px]">
                Jonli xonalar
              </span>
            </div>
            <p className="font-tech mt-1.5 text-[var(--fg)] text-sm sm:text-base">
              <span className="font-bebas text-3xl leading-none tracking-wide sm:text-4xl">
                {roomsCount === null ? '—' : roomsCount}
              </span>
              <span className="ml-2 align-middle text-[var(--fg-mut)]">
                {roomsCount === null ? 'yuklanmoqda' : 'ta xona platformada'}
              </span>
            </p>
          </div>

          <Link
            href="/rooms"
            aria-label="Xonalarni ko'rish"
            className="clip-hex clip-glow grid h-14 w-14 shrink-0 place-items-center bg-gradient-to-br from-[var(--acc-a-soft)] via-[var(--acc-a)] to-[var(--acc-b)] text-[#04040f] transition-[filter,transform] duration-150 active:scale-95"
          >
            <ArrowRight size={20} strokeWidth={2.75} />
          </Link>
        </div>
      </div>

      {/* Yangilik tezkor havola — hero pastida, engil */}
      <div className="relative z-20 mx-auto -mt-6 max-w-3xl px-4 pb-2 sm:px-6">
        <Link
          href="/news"
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[var(--fg-dim)] transition-colors hover:text-[var(--acc-a)]"
        >
          <Newspaper size={12} aria-hidden="true" /> Yangiliklar va aksiyalar
        </Link>
      </div>
    </div>
  );
}