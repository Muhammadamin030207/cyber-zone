'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const locale = useLocale() as string;
  const pathname = usePathname();
  const router = useRouter();

  const labels: Record<string, string> = { uz: "O'z", ru: 'Ру', en: 'En' };

  function setLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="relative group">
      <button className="px-2 py-1.5 text-xs font-medium rounded-lg text-gray-300 hover:text-neon-cyan hover:bg-neon-cyan/10 flex items-center gap-1">
        <Globe size={14} />
        {labels[locale] || locale}
      </button>
      <div className="absolute right-0 mt-1 hidden group-hover:block bg-cyber-900 border border-neon-cyan/20 rounded-lg overflow-hidden min-w-[80px] z-50">
        {(['uz', 'ru', 'en'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neon-cyan/10 ${l === locale ? 'text-neon-cyan font-bold' : 'text-gray-300'}`}
          >
            {labels[l]}
          </button>
        ))}
      </div>
    </div>
  );
}