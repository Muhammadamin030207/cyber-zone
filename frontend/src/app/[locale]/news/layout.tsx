import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site';

const TITLE = 'Yangiliklar va aktsiyalar | CYBER-ZONE';
const DESCRIPTION =
  "CYBER-ZONE yangiliklari, aktsiyalari va e'lonlari — yangi zonalar, chegirmalar va turnir haqida xabardor bo'ling.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${getSiteUrl()}/uz/news` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${getSiteUrl()}/uz/news`,
    type: 'website',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
