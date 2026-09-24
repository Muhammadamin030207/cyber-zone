'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bebas_Neue, Share_Tech_Mono } from 'next/font/google';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const techMono = Share_Tech_Mono({ weight: '400', subsets: ['latin'], variable: '--font-tech-mono' });

export interface HeroCountdownCardProps {
  /** Countdown target — ISO string, timestamp or Date. */
  targetDate: string | number | Date;
  /** Small uppercase promo/event label rendered above the title. */
  eventLabel: string;
  /** Event title rendered as the display heading. */
  eventTitle: string;
  /** Free station count (optional — faqat real ma'lumot bo'lsa ko'rsatiladi). */
  stationsFree?: number;
  /** Total station count. */
  stationsTotal?: number;
  /** Booking page href for the hex CTA. */
  ctaHref: string;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function splitMs(ms: number): TimeLeft {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export default function HeroCountdownCard({
  targetDate,
  eventLabel,
  eventTitle,
  stationsFree,
  stationsTotal,
  ctaHref,
  className,
}: HeroCountdownCardProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const targetMs = new Date(targetDate).getTime();
    if (Number.isNaN(targetMs)) return;

    const tick = () => setRemaining(Math.max(0, targetMs - Date.now()));
    const immediate = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(id);
    };
  }, [targetDate]);

  const live = remaining !== null;

  const timeLeft = useMemo(() => (remaining === null ? null : splitMs(remaining)), [remaining]);
  const { days, hours, minutes, seconds } = timeLeft ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  const dateLabel = useMemo(
    () =>
      new Date(targetDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [targetDate]
  );

  const total = Math.max(1, stationsTotal ?? 0);
  const hasLiveStats = typeof stationsFree === 'number' && typeof stationsTotal === 'number' && total > 0;
  const freePct = hasLiveStats ? Math.min(100, Math.round((Math.max(0, stationsFree!) / total) * 100)) : 0;

  const units: Array<{ key: string; value: string; label: string }> = [
    {
      key: 'days',
      value: live ? pad(days) : '--',
      label: 'Days',
    },
    {
      key: 'hours',
      value: live ? pad(hours) : '--',
      label: 'Hours',
    },
    {
      key: 'mins',
      value: live ? pad(minutes) : '--',
      label: 'Mins',
    },
    {
      key: 'secs',
      value: live ? pad(seconds) : '--',
      label: 'Secs',
    },
  ];

  return (
    <div className={cn('relative w-full', bebas.variable, techMono.variable, className)}>
      {/* ===== HERO ===== */}
      <section
        aria-label={eventLabel}
        className="relative w-full overflow-hidden bg-[var(--cz-bg,#05050f)]"
        style={{ minHeight: '55vh' }}
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
        {/* Ghost watermark */}
        <span
          aria-hidden
          className="font-bebas pointer-events-none absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[18vw] sm:text-[14vw] leading-none tracking-wide text-white/[0.04]"
        >
          CYBER-ZONE
        </span>
        {/* CRT scanlines */}
        <div aria-hidden className="scan-overlay z-[1]" />

        {/* Content */}
        <div className="relative z-10 mx-auto flex min-h-[55vh] w-full max-w-xl flex-col items-center justify-center px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-20">
          <p className="font-tech text-neon-cyan mb-3 text-[11px] font-normal uppercase tracking-[0.35em] sm:text-xs">
            {eventLabel}
          </p>
          <h2 className="font-bebas text-[var(--fg)] text-5xl leading-[0.95] tracking-wide sm:text-6xl md:text-7xl">
            {eventTitle}
          </h2>
          <p className="font-bebas mt-2 text-xl tracking-[0.18em] text-[var(--fg-mut)] sm:text-2xl">
            {live ? dateLabel.toUpperCase() : '\u00A0'}
          </p>

          {/* Countdown timer */}
          <div
            role="timer"
            aria-live="off"
            aria-label={`Time remaining until ${eventTitle}`}
            className="mt-8 grid w-full grid-cols-4 gap-2 sm:gap-3"
          >
            {units.map((u) => (
              <div
                key={u.key}
                className="relative rounded-xl border border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)] bg-[color-mix(in_srgb,var(--acc-a)_7%,transparent)] px-1 py-3 shadow-[inset_0_0_14px_-8px_var(--acc-a)] sm:py-4"
              >
                <div className="font-tech text-[var(--fg)] text-3xl leading-none tabular-nums [text-shadow:0_0_14px_color-mix(in_srgb,var(--acc-a)_55%,transparent)] sm:text-4xl">
                  {u.value}
                </div>
                <div className="font-tech mt-2 text-[9px] uppercase tracking-[0.28em] text-[var(--fg-dim)] sm:text-[10px]">
                  {u.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FLOATING STATUS CARD ===== */}
      <div className="relative z-20 -mt-16 px-4 sm:px-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-[color-mix(in_srgb,var(--acc-a)_40%,transparent)] bg-[color-mix(in_srgb,var(--bg-1)_80%,transparent)] p-4 backdrop-blur-xl shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_6%,transparent),0_24px_50px_-32px_rgba(0,0,0,0.9)] sm:p-5">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              {hasLiveStats ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="animate-pulse-glow h-2 w-2 shrink-0 rounded-full bg-[var(--acc-a)] shadow-[0_0_8px_var(--acc-a)]"
                    />
                    <span className="font-tech text-[var(--fg-mut)] text-[10px] uppercase tracking-[0.3em] sm:text-[11px]">
                      Live Status
                    </span>
                  </div>

                  <p className="font-tech mt-2 text-[var(--fg)] text-sm sm:text-base">
                    <span className="font-bebas text-3xl leading-none tracking-wide sm:text-4xl">
                      {Math.max(0, stationsFree!)}
                      <span className="text-[var(--fg-dim)]">/{total}</span>
                    </span>
                    <span className="ml-2 align-middle text-[var(--fg-mut)]">stations free</span>
                  </p>

                  <div className="clip-angle-sm mt-3 h-2 w-full overflow-hidden bg-[color-mix(in_srgb,var(--acc-a)_14%,transparent)]">
                    <div
                      className="clip-angle-sm h-full bg-gradient-to-r from-[var(--acc-a)] to-[var(--acc-b)] shadow-[0_0_10px_color-mix(in_srgb,var(--acc-a)_60%,transparent)] transition-[width] duration-700 ease-out"
                      style={{ width: `${freePct}%` }}
                      role="progressbar"
                      aria-valuenow={Math.max(0, stationsFree!)}
                      aria-valuemin={0}
                      aria-valuemax={total}
                      aria-label="Station availability"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="animate-pulse-glow h-2 w-2 shrink-0 rounded-full bg-[var(--acc-a)] shadow-[0_0_8px_var(--acc-a)]"
                    />
                    <span className="font-tech text-[var(--fg-mut)] text-[10px] uppercase tracking-[0.3em] sm:text-[11px]">
                      Countdown
                    </span>
                  </div>

                  <p className="font-tech mt-2 text-[var(--fg)] text-sm sm:text-base">
                    <span className="font-bebas text-3xl leading-none tracking-wide sm:text-4xl">
                      {live ? pad(days) : '--'}
                      <span className="text-[var(--fg-dim)]">d</span>
                    </span>
                    <span className="ml-2 align-middle text-[var(--fg-mut)]">
                      until {eventTitle}
                    </span>
                  </p>
                </>
              )}
            </div>

            <Link
              href={ctaHref}
              aria-label="Book a station"
              className="clip-hex clip-glow grid h-16 w-16 shrink-0 place-items-center bg-gradient-to-br from-[var(--acc-a-soft)] via-[var(--acc-a)] to-[var(--acc-b)] text-[#04040f] transition-[filter,transform] duration-150 active:scale-95"
            >
              <ArrowRight size={22} strokeWidth={2.75} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}