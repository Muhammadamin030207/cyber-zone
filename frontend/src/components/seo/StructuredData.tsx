import { getSiteUrl } from '@/lib/site';

/**
 * JSON-LD (schema.org) — Google qidiruvida CYBER-ZONE ni to'g'ri
 * ko'rsatish uchun.
 *
 * Nima uchun kerak: `LocalBusiness` / `EntertainmentBusiness` turi
 * Google xaritada, "qayerda" natijalarida va Knowledge Panel'da
 * ko'rsatiladi. Boshqa turlardan farqli ravishda bu BEPUL — faqat
 * to'g'ri markup kerak (reklama emas).
 *
 * NIMA UCHUN SERVER komponenti (Muhim):
 * Google boti sahifani olganda JavaScript NI ISHLATMAYDI va `fetch` ga
 * javob kutmaydi. Agar JSON-LD `useEffect` orqali sahifa yuklangandan
 * KEYIN qo'shilsa, u bot uchun umuman yo'q bo'lib qoladi — kod to'g'ri
 * bo'lsa ham. Shuning uchun bu SERVER da chiziladi va HTML'ning o'zida
 * `<script type="application/ld+json">` sifatida keladi.
 *
 * Xonalar ro'yxati serverda yig'iladi (natija haqiqiy — soxta raqam
 * yo'q). Backend javob bermasa yoki sekin bo'lsa, `[]` bilan davom
 * etamiz: asosiy `LocalBusiness`/`WebSite` ma'lumotlari statik, xonalar
 * esa qo'shimcha — ularsiz ham markup to'g'ri qoladi.
 *
 * `dangerouslySetInnerHTML` xavfsizligi: `JSON.stringify` `<` belgisini
 * unicode'ga aylantiradi, shuning uchun `</script>` ichidagi kod
 * buzilmaydi.
 */

/** Xona ro'yxati — serverda, qisqa muddat bilan. */
async function fetchRooms(): Promise<Array<{ name: string; address?: string | null }>> {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  try {
    const res = await fetch(`${base}/api/rooms?limit=20`, {
      // Sahifa chizilishini kechiktirmaslik uchun qisqa muddat: backend
      // javob bermasa, `catch` da statik ma'lumot bilan chiqamiz.
      signal: AbortSignal.timeout(2500),
      headers: { accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    const data = (json as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .filter((r): r is { name: string; address?: string | null } =>
        !!r && typeof r === 'object' && typeof (r as { name?: unknown }).name === 'string')
      .map((r) => ({ name: r.name, address: typeof r.address === 'string' ? r.address : null }));
  } catch {
    // Backend yo'q/kechikkan — markupni statik qism bilan chiqaramiz.
    return [];
  }
}

export default async function StructuredData() {
  const rooms = await fetchRooms();
  const siteUrl = getSiteUrl();
  const businessId = `${siteUrl}/#organization`;

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['LocalBusiness', 'EntertainmentBusiness'],
        '@id': businessId,
        name: 'CYBER-ZONE',
        alternateName: 'Cyber-Zone Kompyuter klubi',
        description:
          "Toshkentdagi kompyuter klubi platformasi: zonalarni ko'rish, o'rin bron qilish va onlayn to'lov.",
        url: `${siteUrl}/uz`,
        logo: `${siteUrl}/icons/icon-512.png`,
        image: `${siteUrl}/icons/icon-512.png`,
        // Toshkent markazi — aniq ko'cha belgilanmagan, shuning uchun
        // faqat shahar va mamlakat (xaritada noto'g'ri nuqta chiqmasin).
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Toshkent',
          addressCountry: 'UZ',
        },
        areaServed: { '@type': 'City', name: 'Toshkent' },
        sameAs: [] as string[],
        makesOffer: rooms.map((r) => ({
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `Kompyuter xonasi — ${r.name}`,
            ...(r.address ? { description: r.address } : {}),
          },
        })),
        potentialAction: {
          '@type': 'ReserveAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${siteUrl}/uz/rooms`,
          },
          result: { '@type': 'Reservation', name: 'Kompyuter xonasi bron qilish' },
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'CYBER-ZONE',
        inLanguage: 'uz-UZ',
        publisher: { '@id': businessId },
      },
    ],
  };

  // `</` ni qochiramiz — HTML parser script tugunini bevaxta yopmasin.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      id="cz-structured-data"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
