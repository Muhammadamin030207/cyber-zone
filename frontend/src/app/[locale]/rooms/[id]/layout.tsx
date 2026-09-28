import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site';

/**
 * XONA SAHIFASI — dinamik metadata.
 *
 * Nima uchun har bir xona alohida metadata: Google har bir xona sahifasini
 * alohida indekslaydi. Sarlavha va tavsif xona nomi/manzilidan yig'iladi —
 * shunda "gaming zone toshkent" kabi qidiruvlarda Cyber-ZONE xonasi
 * chiqadi. Statik (kod ichida yozilgan) matn bo'lsa, barcha xonalar
 * bir xil ko'rinib, Google ularni bir-birining takrori deb hisoblar edi.
 *
 * Backend chaqiriladi: metadata `generate` da yig'iladi, sahifa o'zi
 * klient komponentida yuklanadi. Xona topilmasa — `noindex` qaytariladi
 * (404 ichida indekslanmasin).
 */

interface RoomMeta {
  name?: string;
  description?: string | null;
  address?: string | null;
  district?: string | null;
  images?: string[] | null;
}

const BACKEND = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000'
).replace(/\/+$/, '');

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const canonical = `${getSiteUrl()}/${locale}/rooms/${id}`;

  // Xona ma'lumoti — `cache: 'force-cache'` bilan so'rov build paytida
  // ham bajariladi va keyin keshdan olinadi (metadata uchun tez).
  const fetchRoom = async (): Promise<RoomMeta | null> => {
    try {
      const res = await fetch(`${BACKEND}/api/rooms/${id}`, {
        cache: 'force-cache',
        // Xona o'chganda metadata eskirib qolmasin (24 soat).
        next: { revalidate: 86400 },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: RoomMeta };
      return body?.data ?? null;
    } catch {
      return null;
    }
  };

  const room = await fetchRoom();

  if (!room?.name) {
    // Topilmadi — indekslanmasin, lekin canonical o'rniga yo'q.
    return { title: 'Xona topilmadi', robots: { index: false, follow: false } };
  }

  const place = [room.district, room.address].filter(Boolean).join(', ');
  const title = `${room.name} — kompyuter klubi | CYBER-ZONE`;
  const description = room.description
    ? String(room.description).slice(0, 200)
    : `${room.name}${place ? ` (${place})` : ''} — kompyuter zonasi, bron qilish va onlayn to'lov.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      images: room.images?.[0] || '/icons/icon-512.png',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
