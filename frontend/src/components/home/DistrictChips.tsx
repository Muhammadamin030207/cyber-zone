'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface DistrictOption {
  key: string;
  label: string;
  count: number;
}

interface Props {
  districts: DistrictOption[];
  selected: string | null; // null = "Hammasi"
  onSelect: (key: string | null) => void;
}

/**
 * Gorizontal scroll qilinadigan tuman chiplari. Birinchi chip — "Hammasi",
 * default tanlangan. Tanlangan chip to'q sariq. Filtrlash «yangi sahifa
 * yuklamasdan» — onSelect orqali ro'yxat filtrlanadi.
 */
export default function DistrictChips({ districts, selected, onSelect }: Props) {
  const t = useTranslations('home');

  const chip = (key: string | null, label: string, count: number) => {
    const active = selected === key;
    return (
      <button
        key={key ?? 'all'}
        type="button"
        aria-pressed={active}
        onClick={() => onSelect(key)}
        className={cn(
          'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]',
          active
            ? 'border-transparent font-semibold text-[#140b04] shadow-[var(--glow-cta)]'
            : 'border-[var(--line-strong)] bg-[var(--bg-2)] text-[var(--fg-mut)] hover:border-[var(--acc-a)] hover:text-[var(--fg)]'
        )}
        style={
          active
            ? { background: 'linear-gradient(180deg, var(--acc-a-soft), var(--acc-a))' }
            : undefined
        }
      >
        <span>{label}</span>
        {count > 0 && (
          <span className={cn('text-xs opacity-70 tabular-nums', active ? 'text-[#140b04]' : '')}>
            ({count})
          </span>
        )}
      </button>
    );
  };

  return (
    <section aria-label={t('districtsTitle')} className="cz-page-container pt-5 sm:pt-7">
      <div className="mb-3">
        <h2 className="text-lg font-bold tracking-tight text-[var(--fg)] sm:text-xl">
          {t('districtsTitle')}
        </h2>
        <p className="mt-0.5 text-sm text-[var(--fg-mut)]">{t('districtsSubtitle')}</p>
      </div>

      {/* Chetga to'liq chiqadigan scroll — konteyner bilan hizalangan */}
      <div className="no-scrollbar -mx-[var(--page-pad)] overflow-x-auto px-[var(--page-pad)] pb-1">
        <div className="flex items-center gap-2">
          {chip(null, t('chipAll'), districts.reduce((s, d) => s + d.count, 0))}
          {districts.map((d) => chip(d.key, d.label, d.count))}
        </div>
      </div>
    </section>
  );
}