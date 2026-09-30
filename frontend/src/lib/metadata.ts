import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site';
import { routing } from '@/i18n/routing';

/**
 * Ro'yxat sahifalari uchun metadata — `/rooms` va `/news`.
 *
 * Nima uchun bu helper kerak: bu ikkala layout avval `export const metadata`
 * ishlatardi va canonical'ni `getSiteUrl()}/uz/rooms` deb QAT'IY yozgan edi.
 * Ya'ni `ru/rooms` va `en/rooms` sahifalari ham canonical'ni `uz/rooms` ga
 * ko'rsatardi — Google uchta alohida sahifa bitta `uz` sahifasining takrori
 * bo'lib ko'rinardi va `ru`/`en` variantlari indeksdan chiqarilardi.
 *
 * Endi `generateMetadata` locale'ni `params` dan oladi, har bir til uchun
 * o'z canonical'ini va `hreflang` alternates'ini qo'yadi (root layout
 * bilan bir xil mantiq, lekin path bilan).
 */

/** `/uz/rooms` -> `https://…/uz/rooms` */
function canonicalFor(locale: string, path: string): string {
  return `${getSiteUrl()}/${locale}${path}`;
}

/**
 * Barcha tillar uchun `hreflang` alternates'i. `x-default` — tilni bilmaydigan
 * qidiruvchi uchun default tilga (uz) yo'naltiradi.
 */
function languagesFor(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of routing.locales) out[l] = `${getSiteUrl()}/${l}${path}`;
  out['x-default'] = `${getSiteUrl()}/${routing.defaultLocale}${path}`;
  return out;
}

export interface LocalizedPageMeta {
  /** Sarlavhalar har til uchun alohida (`uz` majburiy). */
  title: { uz: string; ru: string; en: string };
  description: { uz: string; ru: string; en: string };
  /** Sahifa yo'li tildan keyingi qism, masalan `/rooms`. */
  path: string;
  ogType?: 'website';
  /** `true` bo'lsa indekslanmasin (shaxsiy sahifalar). */
  noindex?: boolean;
}

type Locale = (typeof routing.locales)[number];

export function localizedPageMetadata(
  locale: string,
  { title, description, path, ogType = 'website', noindex = false }: LocalizedPageMeta,
): Metadata {
  const l = (routing.locales as readonly string[]).includes(locale)
    ? (locale as Locale)
    : routing.defaultLocale;

  const t = title[l] || title[routing.defaultLocale as Locale];
  const d = description[l] || description[routing.defaultLocale as Locale];
  const url = canonicalFor(l, path);

  return {
    title: t,
    description: d,
    alternates: {
      canonical: url,
      languages: languagesFor(path),
    },
    openGraph: {
      title: t,
      description: d,
      url,
      siteName: 'CYBER-ZONE',
      type: ogType,
    },
    twitter: {
      card: 'summary_large_image',
      title: t,
      description: d,
    },
    // `x-default` canonical'ni `uz` ga qaytaradi — `x-default` o'z-o'zidan
    // canonical emas, shuning uchun `noindex` alohida beriladi.
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
