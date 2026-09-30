import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
import { routing } from '@/i18n/routing';

/**
 * GOOGLE DA BEPUL CHIQISH — sitemap.
 *
 * Nima uchun kerak: Google yangi sahifalarni faqat sitemap orqali tez
 * kashf qiladi. Bu fayl `robots.txt` da ko'rsatiladi va
 * Google Search Console'ga (sitemap.xml) foydalanuvchi o'zi yuklaydi.
 *
 * Til prefiksi har doim `localePrefix: 'always'` bilan mos (routing.ts):
 * `/uz/rooms` — `robots.txt` va `hreflang` bilan bir xil.
 */

/**
 * Ommaviy indekslanadigan sahifalar. Ichki sahifalar (admin, kabinet,
 * checkout, login) HECH QACHON bu ro'yxatga tushmaydi — ular `noindex`
 * bilan ham, `robots.txt` dagi `Disallow` bilan ham himoyalangan.
 *
 * `noindex` sahifani sitemap'ga kiritish — qarama-qarshali signal: Google
 * "shu sahifani indekslama" va "shu sahifani indekslama" degan ikki
 * ko'rsatma oladi va odatda ikkinchisini (noindex) tanlaydi, lekin
 * `Disallow` bilan birga kelganda ikkalasini ham qo'llab-quvvatlamaydi —
 * URL boshqalardan ajratib qo'yilishi mumkin bo'ladi.
 */
const PUBLIC_PATHS = [
  { path: '', priority: 1.0, changeFrequency: 'daily' as const },
  { path: '/rooms', priority: 0.9, changeFrequency: 'daily' as const },
  { path: '/news', priority: 0.7, changeFrequency: 'daily' as const },
  // "Menga yaqin xonalar" — mahalliy qidiruv uchun eng muhim ommaviy
  // sahifa ("gaming club tashkent", "internet cafe yonimda"). Indekslanadi
  // (`location/layout.tsx` da `noindex` yo'q), shuning uchun sitemap'da
  // bo'lishi SHART — aks holda `robots` ruxsat bergan, lekin sitemap yo'q
  // bo'lgan sahifa topilmay qoladi.
  { path: '/location', priority: 0.8, changeFrequency: 'weekly' as const },
  // `/ai` — login talab qiladi, shuning uchun sitemap'ga qo'yilmaydi.
  // `/payments` va `/profile/security` — `noindex`, qo'yilmaydi.
];

const BACKEND = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000'
).replace(/\/+$/, '');

/**
 * Xonalar ro'yxatini oladi.
 *
 * Nima uchun sitemap'ga kiritamiz: har bir xona — alohida qidiruv natijasi
 * ("gaming zone toshkent", "internet klub yoshlik"). Sitemap'siz Google
 * yangi xonalarni kunlar/haftalar kechikib topadi.
 *
 * Xato bo'lsa (backend yo'q, timeout) — bo'sh ro'yxat qaytariladi va
 * sitemap FAQAT statik sahifalardan iborat bo'lib qoladi. Bu yaxshiroq:
 * to'liq ishlamaydigan sitemap Google uchun zararli signal.
 */
async function fetchRoomIds(): Promise<string[]> {
  try {
    const res = await fetch(`${BACKEND}/api/rooms`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    if (!Array.isArray(body?.data)) return [];
    return body.data
      .map((r) => r?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const lastModified = new Date();
  const roomIds = await fetchRoomIds();

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    for (const route of PUBLIC_PATHS) {
      const path = route.path ? `${base}/${locale}${route.path}` : `${base}/${locale}`;
      entries.push({
        url: path,
        lastModified,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((l) => [l, route.path ? `${base}/${l}${route.path}` : `${base}/${l}`])
          ),
        },
      });
    }

    // Xonalar — har bir til uchun o'z URL'i (hreflang bilan bog'lanadi).
    for (const id of roomIds) {
      const url = `${base}/${locale}/rooms/${id}`;
      entries.push({
        url,
        // `lastModified` o'rniga `new Date()` — xona yangilangan bo'lishi
        // mumkin, lekin barchasi bir vaqtda emas. Xato bo'lsa (sitemap
        // validatsiyasi) butun sitemap rad etilishi mumkin, shuning uchun
        // ishonchli sana qo'yamiz.
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.8,
        alternates: {
          languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}/rooms/${id}`])),
        },
      });
    }
  }

  return entries;
}
