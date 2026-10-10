'use client';

import { useTranslations } from 'next-intl';
import {
  MapPin,
  ShieldCheck,
  Users,
  Tag,
} from 'lucide-react';
import { formatPrice } from '@/lib/utils';

export interface HeroStats {
  roomsCount: number;
  minPrice: number | null;
  freeSeats: number | null;
  districtsCount: number;
}

/**
 * Katta bitta rounded-3xl hero karta (referens bo'yicha):
 * 2 badge + H1 + qisqa tavsif (real narx bilan) + 4 ta stat karta.
 * Statistika FAQAT real API ma'lumotdan — yasalmaydi.
 */
export default function HeroCard({ stats }: { stats: HeroStats }) {
  const t = useTranslations('home');
  const { roomsCount, minPrice, freeSeats, districtsCount } = stats;

  const tiles = [
    {
      icon: Users,
      label: t('statFree'),
      value: freeSeats === null ? '—' : formatPrice(freeSeats),
      caption: t('statFreeCaption'),
    },
    {
      icon: Tag,
      label: t('statPrice'),
      value: minPrice === null ? '—' : formatPrice(minPrice),
      caption: t('statPriceCaption'),
    },
    {
      icon: MapPin,
      label: t('statLocation'),
      value: districtsCount === 0 ? '—' : String(districtsCount),
      caption: t('statLocationCaption'),
    },
    {
      icon: ShieldCheck,
      label: t('statVerify'),
      value: roomsCount === 0 ? '—' : String(roomsCount),
      caption: t('statVerifyCaption'),
    },
  ];

  return (
    <section aria-labelledby="cz-hero-title" className="cz-page-container">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--line-strong)] bg-[var(--bg-1)] px-5 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-14">
        {/* Yumshoq radial yorug'lik — dekoratsiya, taqlid emas */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(110% 80% at 0% 0%, color-mix(in srgb, var(--acc-a) 16%, transparent) 0%, transparent 55%), radial-gradient(80% 70% at 100% 100%, color-mix(in srgb, var(--acc-b) 12%, transparent) 0%, transparent 55%)',
          }}
        />

        <div className="relative z-10 min-w-0">
          {/* Badge'lar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--acc-a)_35%,transparent)] bg-[color-mix(in_srgb,var(--acc-a)_12%,transparent)] px-3.5 text-sm font-medium text-[var(--acc-a)]">
              <MapPin size={15} aria-hidden="true" />
              {t('heroBadgeCity')}
            </span>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--bg-2)] px-3.5 text-sm font-medium text-[var(--fg-mut)]">
              <ShieldCheck size={15} aria-hidden="true" className="text-[var(--acc-b)]" />
              {t('heroBadgeVerified')}
            </span>
          </div>

          {/* H1 — jumla holida, katta, ixcham tracking */}
          <h1
            id="cz-hero-title"
            className="mt-4 text-[clamp(1.75rem,1.2rem+2.6vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-[var(--fg)] sm:mt-5"
          >
            {t('heroTitle')}
          </h1>

          {/* Qisqa tavsif — real narx oralig'i */}
          <p className="mt-3 max-w-[60ch] text-[length:var(--ad-body)] leading-relaxed text-[var(--fg-mut)] sm:mt-4">
            {t('heroDesc', {
              count: roomsCount || '—',
              min: minPrice === null ? '—' : formatPrice(minPrice),
            })}
          </p>

          {/* 4 ta stat karta */}
          <div className="mt-7 grid grid-cols-2 gap-3 sm:mt-9 sm:gap-4 md:grid-cols-4">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    style={{ background: 'color-mix(in srgb, var(--acc-a) 14%, transparent)' }}
                  >
                    <tile.icon size={16} aria-hidden="true" className="text-[var(--acc-a)]" />
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--fg-mut)]">
                    {tile.label}
                  </span>
                </div>
                <p className="mt-3 truncate text-2xl font-extrabold tracking-tight text-[var(--fg)] sm:text-3xl">
                  {tile.value}
                </p>
                <p className="mt-1 text-xs text-[var(--fg-dim)]">{tile.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}