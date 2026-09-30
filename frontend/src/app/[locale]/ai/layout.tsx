import type { Metadata } from 'next';
import { localizedPageMetadata } from '@/lib/metadata';

/**
 * AI yordamchi. Sahifa login talab qiladi, lekin `noindex` emas —
 * foydalanuvchilar qidiruv orqali topa olsin (`help`/`support` so'rovlari).
 * Kontent dinamik bo'lgani uchun `ogType: 'website'`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return localizedPageMetadata(locale, {
    path: '/ai',
    title: {
      uz: 'AI yordamchi | CYBER-ZONE',
      ru: 'ИИ-помощник | CYBER-ZONE',
      en: 'AI assistant | CYBER-ZONE',
    },
    description: {
      uz: 'CYBER-ZONE yordamchisi: bron qilish, hisob va qoidalar bo‘yicha savollarga javob.',
      ru: 'Помощник CYBER-ZONE: ответы о бронировании, балансе и правилах.',
      en: 'CYBER-ZONE assistant: answers about booking, balance and rules.',
    },
  });
}

/** Layout metadata'ni (canonical/hreflang/noindex) beradi; o'zicha markup'i yo'q. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
