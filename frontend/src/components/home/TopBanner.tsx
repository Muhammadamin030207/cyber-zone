'use client';

import { useEffect, useState } from 'react';
import { Megaphone, ChevronRight, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api from '@/lib/api';
import type { NewsItem } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * TEPADAGI YANGILIK / REKLAMA BANERI.
 *
 * Nima uchun shu yerda: foydalanuvchi birinchi bo'lib shu narsani ko'radi —
 * yangi aktsiya, yangi xona yoki e'lon. Banner bosilganda `/news` ochiladi
 * (alohida sahifa — bosh sahifaga hech narsa tiqilmaydi).
 *
 * Qoidalar:
 *  - Faqat `isActive` yangiliklar ko'rsatiladi (backend filtrlaydi).
 *  - `BANNER` turi birinchi, keyin `PROMOTION`, so'ng `NEWS` — ya'ni
 *    e'lon turi bo'yicha ustuvorlik.
 *  - Xatolik yoki bo'sh ro'yxatda banner umuman chiqmaydi — bo'sh joy
 *    chindan ham ko'rsatilmaydi, degani emas.
 *  - `dismiss` — yopish. Faqat joriy sahifa davomida (sessionStorage):
 *    yangilik chiqqanda yana ko'rinishi kerak, aks holda xabar yashirin
 *    qolib ketadi.
 */

const STORAGE_KEY = 'cz:home-banner-dismissed';

/**
 * Bu sessiyada banner yopilganmi. Faqat `id` saqlanadi — yangi yangilik
 * chiqsa (`id` boshqacha) yana ko'rinadi. `sessionStorage` yopiq bo'lsa
 * (private rejim) — hech qachon yopilgan deb hisoblamaymiz.
 */
function wasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

const TYPE_ORDER: Record<NewsItem['type'], number> = {
  BANNER: 0,
  PROMOTION: 1,
  NEWS: 2,
};

export default function TopBanner() {
  const [item, setItem] = useState<NewsItem | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/api/news')
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data.data as NewsItem[] | undefined) || [];
        const top = list
          .filter((n) => n.isActive !== false)
          .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))[0];
        setItem(top ?? null);
        // Yopilganlik holati shu yerda, asinxron o'qiladi: render paytida
        // `sessionStorage` ga tegish SSR bilan klientda farq qilardi
        // (hydration xatosi). Sost'yan `dismissed` = true boshlang'ich qiymat.
        setDismissed(wasDismissed());
      })
      // Banner muhim emas — jimgina qoldiramiz (mount holatida yopiq).
      .catch(() => { /* jimgina */ });

    return () => { cancelled = true; };
  }, []);

  function close(e: React.MouseEvent) {
    // Link bosilishining oldini olish — yopish tugmasi alohida bo'lishi kerak.
    e.preventDefault();
    e.stopPropagation();
    setDismissed(true);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, item?.id || '1');
    } catch {
      /* ignore */
    }
  }

  if (!item || dismissed) return null;

  return (
    <div className="px-3 sm:px-5 pt-2 sm:pt-3">
      <Link
        href="/news"
        className={cn(
          'group relative flex items-center gap-3 overflow-hidden rounded-2xl border',
          'border-neon-magenta/30 bg-neon-magenta/[0.08] px-4 py-3 pr-11',
          'transition-colors hover:border-neon-magenta/50 hover:bg-neon-magenta/[0.13]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-magenta'
        )}
      >
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-neon-magenta/15 border border-neon-magenta/30 shrink-0">
          <Megaphone size={16} className="text-neon-magenta" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-[0.2em] text-neon-magenta font-bold">
            Yangilik
          </span>
          <span className="block text-sm font-semibold text-gray-100 truncate">
            {item.title}
          </span>
        </span>

        <ChevronRight
          size={16}
          className="shrink-0 text-gray-500 group-hover:translate-x-0.5 group-hover:text-neon-magenta transition-transform"
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={close}
          aria-label="Yangi e'lonni yopish"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-colors"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </Link>
    </div>
  );
}
