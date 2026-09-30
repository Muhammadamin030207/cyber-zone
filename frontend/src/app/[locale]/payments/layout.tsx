import type { Metadata } from 'next';
import { noindex } from '@/lib/noindex';

/**
 * To'lovlar tarixi — foydalanuvchining shaxsiy ma'lumoti (qarz, tranzaksiya
 * summalari). Qidiruv tizimida ko'rinmasin.
 *
 * Eslatma: bu metadata `noindex()` bilan. Sahifa login talab qiladi, ya'ni
 * `noindex` headeri botga `follow: false` beradi va Google ichki linklarni
 * ham indekslamaydi — aynan `noindex.ts` da tushuntirilgan sabab.
 */
export const metadata = noindex("To'lovlar tarixi | CYBER-ZONE");

/** Layout metadata'ni (canonical/hreflang/noindex) beradi; o'zicha markup'i yo'q. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
