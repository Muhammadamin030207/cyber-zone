import type { Metadata } from 'next';
import { noindex } from '@/lib/noindex';

export const metadata: Metadata = noindex('Kirish');

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
