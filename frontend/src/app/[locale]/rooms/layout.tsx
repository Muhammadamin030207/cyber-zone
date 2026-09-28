import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site';

const TITLE = 'Kompyuter xonalari — bron qilish | CYBER-ZONE Toshkent';
const DESCRIPTION =
  "CYBER-ZONE kompyuter xonalari ro'yxati. Zonani tanlang, kompyuter va vaqtni bron qiling, onlayn to'lov qiling.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${getSiteUrl()}/uz/rooms` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${getSiteUrl()}/uz/rooms`,
    type: 'website',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
