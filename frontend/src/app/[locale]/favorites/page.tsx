'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Heart, AlertCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import { useFavorites } from '@/lib/favorites';
import { useRoomsSeats } from '@/hooks/useRoomsSeats';
import type { Room } from '@/lib/types';
import ClubGrid from '@/components/home/ClubGrid';

/**
 * Sevimlilar sahifasi — faqat brauzerda saqlangan ID'lar bo'yicha faol xonalar.
 * Backend'ga `POST` yo'q; ro'yxat `/api/rooms` dan yuklanib, ID'lar bo'yicha
 * filtrlanadi (chiqib ketgan/faol bo'lmagan xonalar avtomatik tashlab qo'yiladi).
 */
export default function FavoritesPage() {
  const t = useTranslations('favorites');
  const ids = useFavorites((s) => s.ids);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    // Sinxron setState'ni effekt tanasidan tashqariga olib chiqamiz
    // (react-hooks/set-state-in-effect toza qoladi).
    void Promise.resolve().then(() => {
      setLoading(true);
      setError(null);
      api
        .get('/api/rooms')
        .then(({ data }) => {
          if (!alive) return;
          const all = (data?.data ?? []) as Room[];
          setRooms(all.filter((r) => r.status === 'ACTIVE' && ids.includes(r.id)));
        })
        .catch((err) => {
          if (alive) setError(getApiErrorMessage(err, 'Sevimli xonalarni yuklab bo‘lmadi.'));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    });
    return () => {
      alive = false;
    };
  }, [ids]);

  const seats = useRoomsSeats(rooms.map((r) => r.id));

  return (
    <div className="flex min-w-0 flex-col">{roomView()}</div>
  );

  function roomView() {
    if (!ids.length) {
      return emptyView();
    }

    if (loading) {
      return (
        <section className="cz-page-container pb-16 pt-4">
          <div className="skeleton mb-4 h-8 w-40 rounded-full" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton h-72 rounded-2xl" />
            ))}
          </div>
        </section>
      );
    }

    if (error) {
      return (
        <section className="cz-page-container flex flex-col items-center justify-center py-24 text-center">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)' }}
          >
            <AlertCircle size={26} aria-hidden="true" className="text-[var(--danger)]" />
          </span>
          <p className="mt-4 max-w-md text-[var(--fg-mut)]">{error}</p>
        </section>
      );
    }

    if (rooms.length === 0) {
      return emptyView();
    }

    return (
      <>
        <section className="cz-page-container pt-4">
          <h1 className="text-xl font-bold tracking-tight text-[var(--fg)] sm:text-2xl">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-mut)]">{t('subtitle')}</p>
        </section>
        <ClubGrid
          rooms={rooms}
          seats={seats}
          title={t('title')}
          loading={false}
          error={null}
          totalCount={rooms.length}
          onRetry={() => undefined}
        />
      </>
    );
  }

  function emptyView() {
    return (
      <section className="cz-page-container flex flex-col items-center justify-center py-24 text-center">
        <span
          className="grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: 'color-mix(in srgb, var(--acc-a) 14%, transparent)' }}
        >
          <Heart size={26} aria-hidden="true" className="text-[var(--acc-a)]" />
        </span>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-[var(--fg)] sm:text-2xl">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-md text-sm text-[var(--fg-mut)]">{t('emptyHint')}</p>
        <Link
          href="/rooms"
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-[#140b04] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]"
          style={{
            background: 'linear-gradient(180deg, var(--acc-a-soft), var(--acc-a))',
            boxShadow: 'var(--glow-cta)',
          }}
        >
          {t('browse')}
        </Link>
      </section>
    );
  }
}