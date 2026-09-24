'use client';

import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';

const THEMES = [
  { id: 'obsidian', name: 'Obsidian', swatch: 'bg-emerald-500', desc: 'Zumrad + Oltin' },
  { id: 'midnight', name: 'Midnight', swatch: 'bg-indigo-500', desc: 'Indigo + Amber' },
  { id: 'cyberpunk', name: 'Cyberpunk', swatch: 'bg-cyan-400', desc: 'Siyan + Magenta' },
  { id: 'aurora', name: 'Aurora', swatch: 'bg-sky-400', desc: 'Muz siyan + Yalpiz' },
  { id: 'halloween', name: 'Halloween', swatch: 'bg-orange-500', desc: 'Qovoq + Zahar purple' },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'cyber-zone-theme';

function applyTheme(theme: ThemeId) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>('obsidian');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeId) || 'obsidian';
    const initial = THEMES.some((t) => t.id === saved) ? saved : 'obsidian';
    queueMicrotask(() => {
      setTheme(initial);
      applyTheme(initial);
    });
  }, []);

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

  function change(id: ThemeId) {
    setTheme(id);
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, id);
    applyTheme(id);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mavzu tanlash"
        data-tip="Mavzu"
        data-tip-top
        className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-white/15 bg-white/[0.06] text-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-colors hover:text-neon-cyan hover:border-neon-cyan/40 hover:bg-white/10"
      >
        <Palette size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" aria-label="Mavzu tanlash" className="absolute right-0 mt-2 w-48 rounded-xl glass border border-white/10 overflow-hidden z-50 shadow-glow menu-pop max-h-[380px] overflow-y-auto scrollbar-thin">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="menuitem"
                onClick={() => change(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                  theme === t.id ? 'bg-white/5 text-neon-cyan' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${t.swatch} ${theme === t.id ? 'ring-2 ring-white/40' : ''}`} />
                <span className="flex-1">
                  <span className="block font-medium leading-tight">{t.name}</span>
                  <span className="block text-[11px] text-gray-500">{t.desc}</span>
                </span>
                {theme === t.id && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}