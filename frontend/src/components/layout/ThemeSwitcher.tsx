'use client';

import { useEffect, useState } from 'react';
import { Zap, Ghost, MoonStar } from 'lucide-react';

export type ThemeId = 'dark' | 'halloween' | 'night';

const THEMES: { id: ThemeId; label: string; icon: typeof Zap; active: string }[] = [
  { id: 'dark', label: 'Dark', icon: Zap, active: 'text-neon-cyan' },
  { id: 'halloween', label: 'Halloween', icon: Ghost, active: 'text-neon-green' },
  { id: 'night', label: 'Night', icon: MoonStar, active: 'text-neon-magenta' },
];

export const THEME_KEY = 'cyber-zone-theme';

export function applyTheme(t: ThemeId) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
}

export function getTheme(): ThemeId {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(THEME_KEY) as ThemeId | null;
    if (saved && THEMES.some((x) => x.id === saved)) return saved;
    const doc = document.documentElement.dataset.theme as ThemeId | undefined;
    if (doc && THEMES.some((x) => x.id === doc)) return doc;
  }
  return 'dark';
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>('dark');

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  function handle(t: ThemeId) {
    applyTheme(t);
    setTheme(t);
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Theme">
      {THEMES.map((t) => {
        const Icon = t.icon;
        const isActive = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => handle(t.id)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={isActive}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
              isActive ? `bg-white/10 ${t.active}` : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}