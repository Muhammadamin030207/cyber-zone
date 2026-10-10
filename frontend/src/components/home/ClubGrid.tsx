'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle, SearchX } from 'lucide-react';
import type { Room } from '@/lib/types';
import type { RoomSeatsMap } from '@/hooks/useRoomsSeats';
import ClubCard from './ClubCard';
import { useMemo } from 'react';

interface Props {
  title?: string;
  rooms: Room[];
  seats: RoomSeatsMap;
  distanceMap?: Record<string, number | null>;
  loading: boolean;
  error: string | null;
  totalCount: number;
  onRetry: () => void;
  onClearDistrict?: () => void;
}

const SKELETONS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Klub (xona) to'ri. Responsive: 1 ustun mobil, 2 md, 3 xl, 4 — 1920+ (2xl).
 * Loading skeleton / bo'sh holat (tuman bo'yicha yoki umuman) / xato holati.
 */
export default function ClubGrid({
  title,
  rooms,
  seats,
  distanceMap,
  loading,
  error,
  totalCount,
  onRetry,
  onClearDistrict,
}: Props) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  const isDistrictEmpty = useMemo(
    () => !loading && !error && totalCount > 0 && rooms.length === 0,
    [loading, error, totalCount, rooms.length]
  );
  const isAllEmpty = useMemo(
    () => !loading && !error && totalCount === 0,
    [loading, error, totalCount]
  );

  return (
    <section aria-labelledby="cz-clubs" className="cz-page-container pb-16 pt-6 sm:pt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2
          id="cz-clubs"
          className="text-lg font-bold tracking-tight text-[var(--fg)] sm:text-xl"
        >
          {title || t('clubsTitle')}
        </h2>
        {!loading && !error && rooms.length > 0 && (
          <span className="text-sm tabular-nums text-[var(--fg-dim)]">
            {rooms.length} ta
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {SKELETONS.map((i) => (
            <div key={i} className="skeleton h-72 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-[var(--line)] bg-[var(--bg-1)] px-6 py-16 text-center">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)' }}
          >
            <AlertCircle size={26} aria-hidden="true" className="text-[var(--danger)]" />
          </span>
          <p className="mt-4 max-w-md text-[var(--fg-mut)]">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] px-6 text-sm font-semibold text-[var(--fg)] transition-colors hover:border-[var(--acc-a)] hover:text-[var(--acc-a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]"
          >
            {tCommon('retry')}
          </button>
        </div>
      ) : isDistrictEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-[var(--line)] bg-[var(--bg-1)] px-6 py-16 text-center">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: 'color-mix(in srgb, var(--acc-a) 14%, transparent)' }}
          >
            <SearchX size={26} aria-hidden="true" className="text-[var(--acc-a)]" />
          </span>
          <p className="mt-4 text-[var(--fg-mut)]">{t('clubEmptyDistrict')}</p>
          {onClearDistrict && (
            <button
              type="button"
              onClick={onClearDistrict}
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-[#140b04] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]"
              style={{
                background: 'linear-gradient(180deg, var(--acc-a-soft), var(--acc-a))',
                boxShadow: 'var(--glow-cta)',
              }}
            >
              {t('chipAll')}
            </button>
          )}
        </div>
      ) : isAllEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-[var(--line)] bg-[var(--bg-1)] px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5">
            <SearchX size={26} aria-hidden="true" className="text-[var(--fg-dim)]" />
          </span>
          <p className="mt-4 text-[var(--fg-mut)]">{t('clubEmptyAll')}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rooms.map((room) => (
            <ClubCard
              key={room.id}
              room={room}
              seats={seats[room.id]}
              distanceKm={distanceMap?.[room.id] ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}