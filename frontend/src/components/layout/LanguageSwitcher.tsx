'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Globe, Check } from 'lucide-react';

const LOCALES = [
  { id: 'uz', label: "O'zbekcha" },
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale() as string;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function setLocale(next: string) {
    setOpen(false);
    router.replace(pathname, { locale: next });
  }

  const current = LOCALES.find((l) => l.id === locale) || LOCALES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Til: ${current.label}`}
        data-tip="Til"
        data-tip-top
        className="inline-flex items-center justify-center gap-1.5 h-9 min-w-9 px-2 text-sm font-medium rounded-xl border border-white/15 bg-white/[0.06] text-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-colors hover:text-neon-cyan hover:border-neon-cyan/40 hover:bg-white/10"
      >
        <Globe size={15} />
        <span className="hidden sm:inline">{current.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Til tanlash"
          className="absolute right-0 mt-2 min-w-[160px] rounded-xl glass border border-white/10 overflow-hidden z-50 shadow-glow menu-pop"
        >
          {LOCALES.map((l) => (
            <button
              key={l.id}
              role="menuitem"
              onClick={() => setLocale(l.id)}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                l.id === locale ? 'text-neon-cyan bg-white/5' : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className="flex-1">{l.label}</span>
              {l.id === locale && <Check size={14} className="shrink-0 text-neon-cyan" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}