'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Sevimli xonalar — faqat brauzerda (backend yo'q, `Do not touch backend`).
 * Kartadagi yurakcha toggle qiladi; header'dagi badge sonni ko'rsatadi, `/favorites`
 * sahifasi esa bu ID'lar bo'yicha faol xonalarni yuklab ko'rsatadi.
 */

interface FavoritesState {
  ids: string[];
  toggle: (id: string) => void;
  has: (id: string) => boolean;
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
        })),
      has: (id) => get().ids.includes(id),
    }),
    { name: 'cyber-zone-favorites' }
  )
);