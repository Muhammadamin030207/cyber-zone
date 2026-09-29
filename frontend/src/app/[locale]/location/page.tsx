'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, Loader2, AlertTriangle, LocateFixed } from 'lucide-react';
import Link from 'next/link';
import api, { getApiErrorMessage } from '@/lib/api';
import { TASHKENT_CENTER } from '@/lib/constants';
import type { Room } from '@/lib/types';

const RoomsMap = dynamic(() => import('@/components/rooms/RoomsMap'), { ssr: false });

interface NearbyRoom {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  images?: string[];
  distanceKm: number | null;
  zones?: { id: string; type: string; name: string; pricePerHour: number; capacity: number }[];
  _count?: { reviews: number };
}

export default function LocationPage() {
  const t = useTranslations('location');

  const [rooms, setRooms] = useState<NearbyRoom[]>([]);
  const [center, setCenter] = useState(TASHKENT_CENTER);
  const [radius, setRadius] = useState(5);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  const load = useCallback(async (lat: number, lng: number, r: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/rooms/nearby', { params: { lat, lng, radius: r } });
      setRooms(data.data || []);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('loadFailed')));
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Boshlang'ich markaz — Toshkent markazi. Sahifa ochilishi zahoti
  // bo'sh qolmasligi uchun avtomatik yuklanadi.
  useEffect(() => {
    void load(TASHKENT_CENTER.lat, TASHKENT_CENTER.lng, radius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(t('noGeolocation'));
      return;
    }
    setLocating(true);
    setGeoDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCenter({ lat: latitude, lng: longitude });
        setLocating(false);
        void load(latitude, longitude, radius);
      },
      () => {
        setLocating(false);
        setGeoDenied(true);
        setError(t('geoDenied'));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [load, radius, t]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          <MapPin className="text-neon-cyan" size={26} aria-hidden />
          {t('title')}
        </h1>
        <p className="mt-1.5 text-sm text-gray-400">{t('subtitle')}</p>
      </header>

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-end">
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="neon-btn inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-60"
        >
          {locating ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <LocateFixed size={16} aria-hidden />}
          {t('useMyLocation')}
        </button>

        <label className="flex-1 text-xs font-medium text-gray-400">
          <span className="mb-1.5 block">{t('radius')}</span>
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            onMouseUp={() => load(center.lat, center.lng, radius)}
            onTouchEnd={() => load(center.lat, center.lng, radius)}
            className="w-full accent-neon-cyan"
          />
          <span className="mt-1 block font-mono text-xs text-gray-300">{radius} km</span>
        </label>

        <p className="font-mono text-[11px] leading-relaxed text-gray-500 sm:text-right">
          {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
        </p>
      </div>

      {geoDenied && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {t('geoDeniedHint')}
        </p>
      )}

      {error && !geoDenied && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2.5 py-20 text-sm text-gray-400">
          <Loader2 size={18} className="animate-spin" aria-hidden />
          {t('loading')}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-14 text-center">
          <Navigation size={26} className="mx-auto mb-3 text-gray-600" aria-hidden />
          <p className="text-sm font-semibold text-gray-300">{t('empty')}</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-500">{t('emptyHint')}</p>
          <Link
            href={`/${t('locale')}/${t('roomsSlug')}`}
            className="mt-4 inline-block rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-gray-200 hover:bg-white/5"
          >
            {t('browseAll')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
          <div className="order-2 space-y-3 lg:order-1">
            <p className="text-xs text-gray-400">
              {t('found', { count: rooms.length, radius })}
            </p>
            {rooms.map((r) => {
              const minPrice = r.zones?.length
                ? Math.min(...r.zones.map((z) => Number(z.pricePerHour)))
                : null;
              return (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 transition-colors hover:border-neon-cyan/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-100">{r.name}</p>
                      {r.address && <p className="mt-0.5 truncate text-xs text-gray-400">{r.address}</p>}
                    </div>
                    {r.distanceKm != null && (
                      <span className="shrink-0 rounded-lg bg-neon-cyan/10 px-2 py-1 font-mono text-[11px] font-bold text-neon-cyan">
                        {r.distanceKm.toFixed(1)} km
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {minPrice != null && (
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
                        {new Intl.NumberFormat('uz-UZ').format(minPrice)} so&apos;m/soat
                      </span>
                    )}
                    <Link
                      href={`/${t('locale')}/rooms/${r.id}`}
                      className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold text-gray-200 hover:bg-white/5"
                    >
                      {t('details')}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="order-1 h-[420px] overflow-hidden rounded-2xl border border-white/10 lg:order-2 lg:h-[calc(100vh-260px)] lg:min-h-[420px]">
            <RoomsMap rooms={rooms as unknown as Room[]} height={520} linkBase={`/${t('locale')}/rooms`} />
          </div>
        </div>
      )}
    </main>
  );
}
