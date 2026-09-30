import type { Metadata } from 'next';
import { noindex } from '@/lib/noindex';

/**
 * Xavfsizlik — 2FA, passkey va parol. Butunlay shaxsiy ma'lumot, qidiruvga
 * chiqmasligi kerak.
 */
export const metadata = noindex('Xavfsizlik | CYBER-ZONE');

/** Layout metadata'ni (canonical/hreflang/noindex) beradi; o'zicha markup'i yo'q. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
