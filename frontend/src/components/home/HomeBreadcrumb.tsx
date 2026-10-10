'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';

/**
 * Breadcrumb: Bosh sahifa > Toshkent > Kompyuter xonalari.
 * Header bilan bir xil konteynerda (`.cz-page-container`).
 */
export default function HomeBreadcrumb() {
  const tNav = useTranslations('nav');
  const tHome = useTranslations('home');

  return (
    <nav aria-label="Breadcrumb" className="cz-page-container pt-4 pb-2 sm:pt-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--fg-mut)]">
        <li>
          <Link
            href="/"
            className="rounded-full px-2 py-1 font-medium transition-colors hover:text-[var(--acc-a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]"
          >
            {tNav('home')}
          </Link>
        </li>
        <li aria-hidden className="text-[var(--fg-dim)]">
          <ChevronRight size={14} />
        </li>
        <li>
          <span className="px-1 text-[var(--fg-mut)]">{tHome('breadcrumbCity')}</span>
        </li>
        <li aria-hidden className="text-[var(--fg-dim)]">
          <ChevronRight size={14} />
        </li>
        <li aria-current="page" className="px-1 font-medium text-[var(--fg)]">
          {tNav('rooms')}
        </li>
      </ol>
    </nav>
  );
}