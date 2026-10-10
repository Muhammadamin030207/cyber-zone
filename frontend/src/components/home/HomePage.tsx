'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room } from '@/lib/types';
import { TASHKENT_DISTRICTS, TASHKENT_CENTER, matchDistrictKey, resolveRoomCoords } from '@/lib/constants';
import { useRoomsSeats } from '@/hooks/useRoomsSeats';
import HeroCard, { type HeroStats } from './HeroCard';
import DistrictChips from './DistrictChips';
import ClubGrid from './ClubGrid';

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Bosh sahifa mazmuni: hero (real statistika) + tuman chiplari + klub to'ri.
 * Agar bitta ombor: `/api/rooms` (barcha tuman bilan), filtr klient tomonda —
 * ya'ni tuman tanlash sahifani qayta yuklamaydi. Bo'sh o'rinlar har bir xona
 * uchun `availability` orqali jonli yuklanadi (procedurel — hech narsa
 * yasalmaydi, xato bo'lsa «—» ko'rsatiladi).
 */
export default function HomePage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [user, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/rooms');
      setRooms((data?.data ?? []) as Room[]);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Xonalarni yuklab bo‘lmadi.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Sinxron setState'ni effekt tanasidan tashqariga olib chiqamiz
    // (react-hooks/set-state-in-effect toza qoladi).
    void Promise.resolve().then(() => fetchRooms());
  }, [fetchRooms]);

  // Masofa uchun — ruxsat berilsa foydalanuvchi joylashuvi, aks holda markaz
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    let alive = true;
    const fallback = () => {
      if (alive) setUserCoords(TASHKENT_CENTER);
    };
    const timer = setTimeout(fallback, 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        if (alive) {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      },
      () => {
        clearTimeout(timer);
        fallback();
      },
      { timeout: 3500, maximumAge: 10 * 60 * 1000 }
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const seats = useRoomsSeats(rooms.map((r) => r.id));

  // Tumanlar — FAQAT ma'lumotda mavjud bo'lganlar (yasalmaydi)
  const districtList = useMemo(() => {
    const order = new Map(TASHKENT_DISTRICTS.map((d, i) => [d, i]));
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const r of rooms) {
      const k = matchDistrictKey(r.district);
      const label = k ?? (r.district ? r.district.trim() : '');
      if (!label) continue;
      const entry = map.get(label);
      if (entry) entry.count += 1;
      else map.set(label, { key: label, label, count: 1 });
    }
    return [...map.values()].sort(
      (a, b) => (order.get(a.label) ?? 999) - (order.get(b.label) ?? 999)
    );
  }, [rooms]);

  const filtered = useMemo(
    () =>
      selectedDistrict
        ? rooms.filter((r) => {
            const label = matchDistrictKey(r.district) ?? (r.district || '').trim();
            return label === selectedDistrict;
          })
        : rooms,
    [rooms, selectedDistrict]
  );

  const minPrice = useMemo(() => {
    const prices: number[] = [];
    for (const r of rooms) {
      for (const z of r.zones ?? []) {
        const v = Number(z.pricePerHour);
        if (Number.isFinite(v) && v > 0) prices.push(v);
      }
    }
    return prices.length ? Math.min(...prices) : null;
  }, [rooms]);

  const freeSeats = useMemo(() => {
    let sum = 0;
    let known = 0;
    for (const s of Object.values(seats)) {
      if (s.free !== null) {
        sum += s.free;
        known += 1;
      }
    }
    return known ? sum : null;
  }, [seats]);

  const distanceMap = useMemo(() => {
    if (!user) return undefined;
    const out: Record<string, number | null> = {};
    for (const r of rooms) {
      const c = resolveRoomCoords(r);
      out[r.id] = Math.round(haversineKm(user, c) * 10) / 10;
    }
    return out;
  }, [rooms, user]);

  const stats: HeroStats = {
    roomsCount: rooms.length,
    minPrice,
    freeSeats,
    districtsCount: districtList.length,
  };

  return (
    <div className="flex min-w-0 flex-col">
      <HeroCard stats={stats} />
      {!loading && !error && rooms.length > 0 && (
        <DistrictChips
          districts={districtList}
          selected={selectedDistrict}
          onSelect={setSelectedDistrict}
        />
      )}
      <ClubGrid
        rooms={filtered}
        seats={seats}
        distanceMap={distanceMap}
        loading={loading}
        error={error}
        totalCount={rooms.length}
        onRetry={fetchRooms}
        onClearDistrict={() => setSelectedDistrict(null)}
      />
    </div>
  );
}