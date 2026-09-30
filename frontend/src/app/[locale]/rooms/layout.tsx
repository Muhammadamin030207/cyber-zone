import type { Metadata } from 'next';
import { localizedPageMetadata } from '@/lib/metadata';

/**
 * XONALAR RO'YXATI — metadata endi locale'ga qarab o'zgaradi.
 *
 * Oldingi versiya `export const metadata` edi va canonical'ni har doim
 * `/uz/rooms` qilib yozgan edi. Bu `ru/rooms` va `en/rooms` sahifalarini
 * `uz/rooms` ning kalka deb belgilashga majbur qilardi — uchala til bitta
 * manzilga birlashtirilib, `ru`/`en` indeksdan chiqib ketardi.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return localizedPageMetadata(locale, {
    path: '/rooms',
    title: {
      uz: "Kompyuter xonalari — bron qilish | CYBER-ZONE Toshkent",
      ru: 'Компьютерные клубы — бронирование | CYBER-ZONE Ташкент',
      en: 'Gaming rooms — book now | CYBER-ZONE Tashkent',
    },
    description: {
      uz: "CYBER-ZONE kompyuter xonalari ro'yxati. Zonani tanlang, kompyuter va vaqtni bron qiling, onlayn to'lov qiling.",
      ru: 'Каталог компьютерных клубов CYBER-ZONE. Выберите зону, забронируйте время и оплатите онлайн.',
      en: 'Browse CYBER-ZONE gaming rooms. Pick a zone, reserve a PC and time slot, and pay online.',
    },
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
