'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { todayISO } from '@/lib/utils';

export interface RoomSeats {
  free: number | null;
  total: number | null;
}

export type RoomSeatsMap = Record<string, RoomSeats>;

/** Bir vaqtda ko'pi bilan N ta so'rov — ro'yxat paginatsiyasiz bo'lsa ham
 *  backend'ni yuklamaymiz (har bitta xona uchun alohida availability). */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<RoomSeats | undefined>
): Promise<{ index: number; seats?: RoomSeats }[]> {
  const results: { index: number; seats?: RoomSeats }[] = [];
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          const seats = await fn(items[idx], idx);
          if (seats) results.push({ index: idx, seats });
        } catch {
          // Bir xonaning mavjudligi yuklanmasa — kartada «—» ko'rsatiladi,
          // butun sahifa buzilmaydi.
        }
      }
    }
  );
  await Promise.all(workers);
  return results.sort((a, b) => a.index - b.index);
}

/**
 * Har bir xona uchun jonli bo'sh o'rinlar sonini yuklaydi
 * (`GET /api/bookings/rooms/:id/availability?date=today`). Xona muvaffaqiyatsiz
 * bo'lsa `free:null, total:null` — UI'da «yuklanmoqda/yod bo'lmagan» holat.
 */
export function useRoomsSeats(roomIds: string[]) {
  const [seats, setSeats] = useState<RoomSeatsMap>({});
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const missing = [...new Set(roomIds)].filter((id) => !loadedRef.current.has(id));
    if (!missing.length) return;

    const date = todayISO();
    let cancelled = false;

    mapLimit(missing, 4, async (id) => {
      const { data } = await api.get(
        `/api/bookings/rooms/${id}/availability?date=${date}`
      );
      const zones = (data?.data?.zones ?? data?.data ?? []) as Array<{
        availableComputers?: number;
        totalComputers?: number;
      }>;
      const total = zones.reduce((s, z) => s + (z.totalComputers ?? 0), 0);
      const free = zones.reduce((s, z) => s + (z.availableComputers ?? 0), 0);
      if (total <= 0) return { free: null, total: null };
      return { free: Math.max(0, free), total };
    }).then((res) => {
      if (cancelled) return;
      const next: RoomSeatsMap = {};
      res.forEach((r) => {
        if (r.seats) {
          next[missing[r.index]] = r.seats;
          loadedRef.current.add(missing[r.index]);
        }
      });
      setSeats((prev) => ({ ...prev, ...next }));
    });

    return () => {
      cancelled = true;
    };
  }, [roomIds]);

  return seats;
}