'use client';

import { useEffect } from 'react';
import api from '@/lib/api';
import { getSiteUrl } from '@/lib/site';

/**
 * JSON-LD (schema.org) — Google qidiruvida CYBER-ZONE ni to'g'ri
 * ko'rsatish uchun.
 *
 * Nima uchun kerak: `LocalBusiness` / `HealthAndBeautyBusiness` turi
 * Google xaritada, "qayerda" natijalarida va Knowledge Panel'da
 * ko'rsatiladi. Boshqa turlardan farqli ravishda bu BEPUL — faqat
 * to'g'ri markup kerak (reklama emas).
 *
 * Diqqat: narx/joylashuv QO'LDAN yoziladi (backend'da kompaniya
 * manzili yo'q). Bu ma'lumot o'zgarganda shu fayl ham yangilanishi kerak.
 *
 * `dangerouslySetInnerHTML` xavfsizligi: ma'lumot statik (kod ichida),
 * foydalanuvchi kiritmaydi — `JSON.stringify` `<` belgisini unicode'ga
 * aylantiradi (`</script>` ichidagi kod buzilmaydi).
 */
export default function StructuredData() {
  useEffect(() => {
    // Xonalar ro'yxatidan foydalanuvchi kelganda real kompyuter xonalari
    // soni va eng mashhurlari haqiqatda ko'rinadi (soxta raqam yo'q).
    let cancelled = false;

    api
      .get('/api/rooms')
      .then(({ data }) => {
        if (cancelled) return;
        const rooms = (data.data as Array<{ name: string; address?: string | null }> | undefined) || [];
        inject(rooms);
      })
      // Backend bo'lmasa ham sahifa ishlashi kerak — asosiy ma'lumot
      // (nom, tavsif, manzil) statik, xonalar qo'shimcha.
      .catch(() => inject([]));

    return () => { cancelled = true; };
  }, []);

  return null;
}

function inject(rooms: Array<{ name: string; address?: string | null }>) {
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
        makesOffer: rooms
          .slice(0, 20)
          .map((r) => ({
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

  // Xuddi shu schema ikki marta qo'shilmasin (StrictMode effektlar
  // qo'sha chaqiradi) — eskisini olib tashlaymiz.
  document.getElementById('cz-structured-data')?.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'cz-structured-data';
  // `</` ni qochiramiz — HTML parser script tugunini bevaxta yopmasin.
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  document.head.appendChild(script);
}
