import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

/**
 * GOOGLE BOT YO'RIQNOMASI.
 *
 * Asosiy vazifa: botlar SAHIFALarni ko'rib chiqsin (`Allow: /`), lekin
 * maxfiy sahifalar indekslanmasin.
 *
 * Nima uchun `Disallow` emas, `noindex`:
 *  - `Disallow` — bot sahifani ko'rmaydi, demak undagi linklarni ham
 *    kuzatmaydi. Yangi ichki sahifalar topilmagan bo'lib qoladi.
 *  - `noindex` (metadata orqali, `src/lib/noindex.ts`) — bot sahifani
 *    ko'radi, lekin indeksga SOLMAYDI va undagi linklarni kuzatadi.
 *  - Bu ikki usul BIRGA qo'llanilmasligi kerak: `Disallow` qo'yilgan
 *    sahifa `noindex` ni o'qiydigan botga tegib o'tmaydi.
 *
 * Shuning uchun bu yerda FAQAT API bloklanadi (u browser uchun emas,
 * indekslash ham ma'nosiz). Sahifalar darajasidagi himoya — `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Faqat API: JSON javob — indekslashga mos emas va kriptografik
        // kalitlar uchun noto'g'ri yo'l. Sahifalar `noindex` bilan
        // himoyalangan (yuqoragiga qarang).
        disallow: ['/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
