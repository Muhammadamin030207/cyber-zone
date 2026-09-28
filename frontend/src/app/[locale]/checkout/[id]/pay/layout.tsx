import type { Metadata } from 'next';
import { noindex } from '@/lib/noindex';

export const metadata: Metadata = noindex('To\'lov natijasi');

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
