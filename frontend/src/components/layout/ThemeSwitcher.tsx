'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeId) || 'obsidian';
    const initial = THEMES.some((t) => t.id === saved) ? saved : 'obsidian';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function change(id: ThemeId) {
    setTheme(id);
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, id);
    applyTheme(id);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-lg text-gray-300 hover:text-neon-cyan hover:bg-white/5 transition-colors"
        title="Mavzu"
      >
        <Palette size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 rounded-xl glass border border-white/10 overflow-hidden z-50 shadow-glow animate-fade-in max-h-[380px] overflow-y-auto scrollbar-thin">
            {THEMES.map((t) => (
              <button
                key={t.id}
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