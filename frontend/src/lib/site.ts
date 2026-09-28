/**
 * Sayt manzili — bitta manba (single source of truth).
 *
 * Nima uchun alohida fayl: `sitemap.ts`, `robots.ts`, `metadataBase` va
 * JSON-LD bir xil manzilni ishlatishi SHART. Agar har biri boshqa URL
 * yozsa, Google bir sahifani ikki marta (canonical o'zgarishi bilan)
 * indekslaydi va SEO natijasi pasayadi.
 *
 * `NEXT_PUBLIC_SITE_URL` bilan ustidan yozib olish mumkin (staging/prod).
 * Berilmasa — ishga tushirilgan domen (production'da Vercel).
 */

const DEFAULT_SITE_URL = 'https://frontend-six-bay-25.vercel.app';

function normalize(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Bo'sh yoki noto'g'ri URL bo'lsa default'ga qaytadi (sitemap buzilmasin). */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (raw) {
    try {
      const parsed = new URL(raw);
      return normalize(parsed.origin + parsed.pathname);
    } catch {
      /* noto'g'ri qiymat — quyidagi default ishlatiladi */
    }
  }
  return DEFAULT_SITE_URL;
}

/**Til prefiksi bilan to'liq manzil: `/uz/rooms` -> `https://…/uz/rooms`. */
export function absoluteUrl(path = '/'): string {
  const base = getSiteUrl();
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean === '/' ? `${base}/` : `${base}${clean}`;
}
