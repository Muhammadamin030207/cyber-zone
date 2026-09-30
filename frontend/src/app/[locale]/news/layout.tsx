import type { Metadata } from 'next';
import { localizedPageMetadata } from '@/lib/metadata';

/**
 * YANGILIKLAR — metadata endi locale'ga qarab o'zgaradi.
 *
 * Oldingi versiya canonical'ni har doim `/uz/news` qilib yozgan edi, ya'ni
 * `ru/news` va `en/news` tildagi variantlar `uz` manzilga birlashtirilgan edi.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return localizedPageMetadata(locale, {
    path: '/news',
    title: {
      uz: 'Yangiliklar va aktsiyalar | CYBER-ZONE',
      ru: 'Новости и акции | CYBER-ZONE',
      en: 'News and promotions | CYBER-ZONE',
    },
    description: {
      uz: "CYBER-ZONE yangiliklari, aktsiyalari va e'lonlari — yangi zonalar, chegirmalar va turnir haqida xabardor bo'ling.",
      ru: 'Новости, акции и объявления CYBER-ZONE — новые зоны, скидки и турниры.',
      en: 'CYBER-ZONE news, promotions and announcements — new zones, discounts and tournaments.',
    },
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
