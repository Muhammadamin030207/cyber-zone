'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Heart, MapPin, Monitor, Star } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useFavorites } from '@/lib/favorites';
import { formatPrice, cn } from '@/lib/utils';
import type { Room } from '@/lib/types';
import type { RoomSeats } from '@/hooks/useRoomsSeats';

interface Props {
  room: Room;
  seats?: RoomSeats | null;
  distanceKm?: number | null;
}

/**
 * Xona (klub) kartasi — 1 ustun (mobil), 2 (md), 3 (xl), 4 (1920+).
 * Foto (fallback bilan), nom, tuman + masofa, bo'sh o'rinlar (ingichka
 * progress bar), narx, rating (mavjud bo'lsa), sevimli yurakcha, "Joy tanlash".
 */
export default function ClubCard({ room, seats, distanceKm }: Props) {
  const t = useTranslations('home');
  const favorites = useFavorites((s) => s.ids);
  const toggleFav = useFavorites((s) => s.toggle);
  const fav = favorites.includes(room.id);

  const img = room.images?.[0];
  const minPrice = room.zones?.length
    ? Math.min(...room.zones.map((z) => Number(z.pricePerHour)))
    : 0;

  const free = seats?.free ?? null;
  const total = seats?.total ?? null;
  const pct = free !== null && total && total > 0 ? Math.round((free / total) * 100) : 0;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-1)] transition-colors hover:border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)]">
      {/* FOTO */}
      <div className="relative h-40 overflow-hidden">
        <Link
          href={`/rooms/${room.id}`}
          aria-label={room.name}
          className="absolute inset-0 bg-[var(--bg-2)]"
        >
          {img ? (
            <Image
              src={img}
              alt=""
              fill
              sizes="(max-width:767px) 100vw, (max-width:1535px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[color-mix(in_srgb,var(--acc-a)_14%,transparent)] to-transparent">
              <Monitor size={44} aria-hidden="true" className="text-[var(--fg-dim)]" />
            </span>
          )}
        </Link>

        {/* Rating (mavjud bo'lsa) */}
        {typeof room.avgRating === 'number' && room.ratingCount ? (
          <span className="absolute left-3 top-3 inline-flex h-8 items-center gap-1 rounded-full border border-white/10 bg-black/60 px-3 text-xs font-semibold text-yellow-300 backdrop-blur-sm">
            <Star size={12} className="fill-yellow-300" aria-hidden="true" />
            {room.avgRating.toFixed(1)} ({room.ratingCount})
          </span>
        ) : null}

        {/* Sevimli yurakcha */}
        <button
          type="button"
          onClick={() => toggleFav(room.id)}
          aria-label={fav ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qo\'shish'}
          aria-pressed={fav}
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/50 text-white backdrop-blur-sm transition-colors hover:border-[var(--acc-a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]"
        >
          <Heart
            size={18}
            aria-hidden="true"
            className={cn(fav ? 'fill-[var(--acc-a)] text-[var(--acc-a)]' : 'text-white')}
          />
        </button>
      </div>

      {/* BODY */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <Link
          href={`/rooms/${room.id}`}
          className="line-clamp-1 text-base font-bold tracking-tight text-[var(--fg)] transition-colors hover:text-[var(--acc-a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]"
        >
          {room.name}
        </Link>

        <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-[var(--fg-mut)]">
          <MapPin size={13} aria-hidden="true" className="shrink-0 text-[var(--acc-a)]" />
          <span className="truncate">{room.district || room.address}</span>
          {distanceKm != null && (
            <span className="shrink-0 text-[var(--fg-dim)]">· {t('clubDistanceKm', { km: distanceKm })}</span>
          )}
        </p>

        {/* Bo'sh o'rinlar */}
        <div className="mt-4">
          {free === null ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--fg-dim)]">{t('clubFree')}</span>
                <span className="skeleton h-3 w-10 rounded-full" />
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="skeleton h-full w-2/3 rounded-full" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--fg-dim)]">{t('clubFree')}</span>
                <span className="font-bold tabular-nums text-[var(--acc-b)]">
                  {formatPrice(free)} / {formatPrice(total ?? 0)}
                  <span className="ml-1 font-normal text-[var(--fg-dim)]">{t('clubSeats')}</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: 'linear-gradient(90deg, var(--acc-a), var(--acc-b))',
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer: narx + Joy tanlash */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <div className="min-w-0">
            <p className="text-[11px] text-[var(--fg-dim)]">{t('clubFromHour')}</p>
            <p className="truncate text-lg font-extrabold tracking-tight text-[var(--fg)]">
              {formatPrice(minPrice)} <span className="text-xs font-medium text-[var(--fg-mut)]">so'm</span>
            </p>
          </div>
          <Link
            href={`/rooms/${room.id}`}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold text-[#140b04] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]"
            style={{
              background: 'linear-gradient(180deg, var(--acc-a-soft), var(--acc-a))',
              boxShadow: 'var(--glow-cta)',
            }}
          >
            {t('clubBook')}
          </Link>
        </div>
      </div>
    </article>
  );
}