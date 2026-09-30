import type { Metadata } from 'next';
import { localizedPageMetadata } from '@/lib/metadata';

/**
 * Yaqin xonalar — ommaviy (login'siz) sahifa, shuning uchun indekslanadi
 * va har til uchun o'z canonical/hreflang'ini oladi.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return localizedPageMetadata(locale, {
    path: '/location',
    title: {
      uz: 'Yaqin xonalar — Toshkent | CYBER-ZONE',
      ru: 'Ближайшие клубы — Ташкент | CYBER-ZONE',
      en: 'Gaming rooms near you — Tashkent | CYBER-ZONE',
    },
    description: {
      uz: 'Yaqinlikdagi CYBER-ZONE kompyuter xonalarini xaritada toping, masofani va narxlarni ko‘ring.',
      ru: 'Найдите ближайшие клубы CYBER-ZONE на карте, посмотрите расстояние и цены.',
      en: 'Find the nearest CYBER-ZONE gaming rooms on the map, with distance and prices.',
    },
  });
}

/** Layout metadata'ni (canonical/hreflang/noindex) beradi; o'zicha markup'i yo'q. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
