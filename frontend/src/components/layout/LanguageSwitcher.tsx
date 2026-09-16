'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

const FLAGS: Record<string, { flag: string; label: string }> = {
  uz: { flag: '\u{1F1FA}\u{1F1FF}', label: "O'zbekcha" },
  ru: { flag: '\u{1F1F7}\u{1F1FA}', label: 'Русский' },
  en: { flag: '\u{1F1EC}\u{1F1E7}', label: 'English' },
};

export default function LanguageSwitcher() {
  const locale = useLocale() as string;
  const pathname = usePathname();
  const router = useRouter();

  function setLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  const current = FLAGS[locale] || FLAGS.uz;

  return (
    <div className="relative group">
      <button className="px-2 py-1.5 text-xs font-medium rounded-lg text-gray-300 hover:text-neon-cyan hover:bg-neon-cyan/10 flex items-center gap-1.5">
        <span className="text-base leading-none">{current.flag}</span>
        <span>{current.label}</span>
      </button>
      <div className="absolute right-0 mt-1 hidden group-hover:block bg-cyber-900 border border-neon-cyan/20 rounded-lg overflow-hidden min-w-[120px] z-50 shadow-xl">
        {(['uz', 'ru', 'en'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-neon-cyan/10 ${l === locale ? 'text-neon-cyan font-bold' : 'text-gray-300'}`}
          >
            <span className="text-base leading-none">{FLAGS[l].flag}</span>
            <span>{FLAGS[l].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}