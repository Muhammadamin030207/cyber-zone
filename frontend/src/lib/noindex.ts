import type { Metadata } from 'next';

/**
 * ICHKI SAHIFA METADATASI — qidiruv tizimlarida ko'rinmasin.
 *
 * Nima uchun: admin paneli, shaxsiy kabinet, profil va to'lov sahifalari
 * qidiruvda chiqsa — Google'da sayt noto'g'ri ko'rinadi ("kirish sahifasi"
 * qidiruvi, "profil" natijalari) va o'z ma'lumotimiz oshkor bo'ladi.
 *
 * `follow: false` — bu sahifadagi linklar ham indekslanmasin. Sabab: agar
 * `follow: true` bo'lsa, Google ichki sahifa orqali yana ommaviy
 * sahifalarni topishi mumkin (oddiy usulda `noindex` buni to'xtamaydi).
 * Bu sahifalar `robots.txt` da ham `Disallow` qilingan — ikki qatlam
 * himoya.
 *
 * `title` alohida beriladi: har sahifaning o'z nomi bo'lsin (tab
 * sarlavhasida ko'rinadi), lekin `site name` umumiy qolsin.
 */
export function noindex(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false },
  };
}
