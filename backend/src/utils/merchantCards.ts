import prisma from '../lib/prisma';

/**
 * DOGAON (MERCHANT) KARTALARI — to'lov usuliga bog'langan.
 *
 * Nima uchun bir emas, ko'p karta:
 * To'lov usullari turli banklarga tegishli. Masalan Uzum orqali to'lov
 * VISA kartaga, UzCard orqali — o'z kartasiga tushadi. Foydalanuvchi
 * noto'g'ri kartaga o'tkazsa, bank hisobini solishtirish imkoni bo'lmaydi
 * va to'lov tasdiqlanmay qoladi.
 *
 * Qayerda saqlanadi:
 * `SiteSetting` jadvalida `payment_cards_by_method` kaliti ostida JSON:
 *   {
 *     "UZUM":   { "number": "...", "holder": "...", "bank": "...", "appUrl": "..." },
 *     "UZCARD": { "number": "...", "holder": "...", "bank": "...", "appUrl": "..." },
 *     "DEFAULT":{ "number": "...", "holder": "...", "bank": "...", "appUrl": "..." }
 *   }
 *
 * `appUrl` — karta raqamini nusxalagandan keyin «Ilovaga o'tib to'lash»
 * tugmasi shu havola bilan foydalanuvchining bank/to'lov ilovasini
 * ochadi (masalan Payme -> payme.uz, Uzum -> uzumcheckout.uz). Bo'sh
 * bo'lsa — tugma ko'rsatilmaydi, foydalanuvchi ilovani o'zi ochadi.
 *
 * `DEFAULT` — boshqa barcha usullar uchun zaxira (PAYME, CLICK, PAYNET,
 * TRANSFER...). Uni to'ldirmasangiz eski `payment_card_*` kalitlari
 * (legacy) ishlatiladi — shu sabab eski sozlamalar buzilmaydi.
 *
 * XAVFSIZLIK: karta raqamlari hech qachon ommaviy endpointda chiqmaydi
 * (`PRIVATE_SITE_SETTING_KEYS`). Faqat autentifikatsiyalangan javobda,
 * foydalanuvchining o'z to'lov jarayonida qaytariladi.
 */

/** Bitta karta — so'zmaydigan qisqa shakl. */
export interface MerchantCard {
  number: string;
  numberFormatted: string;
  holder: string;
  bank: string;
  note: string;
  /** Bank/to'lov ilovasining URL'i (ixtiyoriy). */
  appUrl: string;
}

type CardRecord = {
  number?: string;
  holder?: string;
  bank?: string;
  note?: string;
  appUrl?: string;
};

/**
 * `appUrl` ni tekshiradi: faqat `https://` (yoki `http://` lokal sinov uchun)
 * — `javascript:` / `data:` kabi sxema XSS oynasi ochmasin.
 */
function sanitizeAppUrl(raw: string | undefined): string {
  const value = (raw || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : '';
}

const LEGACY_KEYS = [
  'payment_card_number',
  'payment_card_holder',
  'payment_card_bank',
  'payment_card_note',
] as const;

/** Karta raqamini nusxalash uchun guruhlab (4111 1111 1111 1111). */
export function formatCardNumber(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** JSON.parse bilan xato chiqsa jimgina bo'sh obyekt qaytaradi. */
function parseCardMap(raw: string | undefined): Record<string, CardRecord> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, CardRecord> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k.toUpperCase()] = v as CardRecord;
      }
    }
    return out;
  } catch {
    // Noto'g'ri JSON saqlangan bo'lsa — jimgina eski sozlamaga qaytamiz.
    return {};
  }
}

/** `CardRecord` -> `MerchantCard` (raqam bo'sh bo'lsa null). */
function pickCard(rec: CardRecord | undefined): MerchantCard | null {
  const number = (rec?.number || '').trim();
  if (!number) return null;
  return {
    number,
    numberFormatted: formatCardNumber(number),
    holder: (rec?.holder || '').trim(),
    bank: (rec?.bank || '').trim(),
    note: (rec?.note || '').trim(),
    appUrl: sanitizeAppUrl(rec?.appUrl),
  };
}

/**
 * Kartani usul bo'yicha YECHADI (zaxira zanjiri):
 *   aniq usul (`UZUM`) -> `DEFAULT` -> eski `payment_card_*` -> `UZCARD`.
 *
 * `UZCARD` (UzCard) egasining "asosiy" bank kartasi sanaladi — shuning uchun
 * alohida karta bo'lmagan boshqa barcha usullar (PAYME, CLICK, PAYNET, HUMO,
 * TRANSFER...) shu kartaga o'tkazadi. Bu egasi oldindan belgilagan qoida:
 * Uzum to'lovlari VISA kartaga, qolgan hamma usullar — UzCard egasiga.
 * Agar admin kelajakda biror usulga O'Z karta qo'shsa — u aniq usul sifatida
 * ustun keladi (zanjirning birinchi bo'g'ini).
 */
function resolveFor(
  key: string,
  byMethod: Record<string, CardRecord>,
  map: Record<string, string>
): MerchantCard | null {
  if (key && key !== 'DEFAULT') {
    const exact = pickCard(byMethod[key]);
    if (exact) return exact;
  }

  const fallback = pickCard(byMethod.DEFAULT);
  if (fallback) return fallback;

  // Eski (legacy) sozlamalar — yangi JSON bo'sh bo'lsa.
  const number = (map.payment_card_number || '').trim();
  if (number) {
    return {
      number,
      numberFormatted: formatCardNumber(number),
      holder: (map.payment_card_holder || '').trim(),
      bank: (map.payment_card_bank || '').trim(),
      note: (map.payment_card_note || '').trim(),
      appUrl: '',
    };
  }

  // Umumiy zaxira: UzCard — boshqa usullar uchun asosiy qabul karta.
  return pickCard(byMethod.UZCARD);
}

/**
 * Chekoutda rasmiy ko'rsatiladigan to'lov usullari — karta qaysi usul uchun
 * mavjud bo'lsa. Aniq usul kartasi bo'lmagan usullar umumiy (UzCard/DEFAULT)
 * kartaga tushadi, shu sabab ekronda usulsiz "karta bor" holati qolmaydi.
 */
/**
 * Foydalanuvchi ko'radigan to'lov usullari — FAQAT shular (§22).
 *
 * UZCARD / HUMO / VISA alohida "to'lov usuli" sifatida chiqarilgan: ular
 * karta TURLARI, mustaqil to'lov kanali emas. Ular faqat `payment_cards_by_method`
 * ichidagi bank ma'lumotida qolishi mumkin (masalan Payme kartasi — UzCard
 * bo'lishi mumkin), lekin hech qachon alohida tanlanadigan usul bo'lmaydi.
 */
const KNOWN_CARD_METHODS = ['PAYME', 'CLICK', 'PAYNET', 'UZUM', 'TRANSFER'];

/**
 * Barcha SOZLANGAN kartalar — usul (katta harfda) -> karta.
 * Faqat raqami to'ldirilgan kartalar qaytariladi.
 * Chekout sahifasi shu ro'yxat bo'yicha to'lov usullarini qurushi uchun.
 */
export async function listConfiguredCards(): Promise<Record<string, MerchantCard>> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: ['payment_cards_by_method', ...LEGACY_KEYS] } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const byMethod = parseCardMap(map.payment_cards_by_method);
  const out: Record<string, MerchantCard> = {};
  for (const key of KNOWN_CARD_METHODS) {
    const card = resolveFor(key, byMethod, map);
    if (card) out[key] = card;
  }

  // Eski `payment_card_*` sozlamalari — yangi usul karta xaritasi bo'lsa ham
  // paritet uchun `DEFAULT` sifatida foydalanuvchiga ko'rinadi.
  if (!out.DEFAULT) {
    const legacyNumber = (map.payment_card_number || '').trim();
    if (legacyNumber) {
      out.DEFAULT = {
        number: legacyNumber,
        numberFormatted: formatCardNumber(legacyNumber),
        holder: (map.payment_card_holder || '').trim(),
        bank: (map.payment_card_bank || '').trim(),
        note: (map.payment_card_note || '').trim(),
        appUrl: '',
      };
    }
  }
  return out;
}

/**
 * Usulga mos karta.
 *
 * Tartib: aniq usul (`UZUM`) -> `DEFAULT` -> eski `payment_card_*` -> `UZCARD`
 * (umumiy qabul karta). Aynan shu usul uchun karta yo'q bo'lsa ham `null`
 * QAYTMAYDI — zaxiraga tushadi: aks holda foydalanuvchi "karta yo'q" deb
 * xato ko'rardi, holbuki umumiy karta bor.
 */
export async function resolveMerchantCard(method: string | null | undefined): Promise<MerchantCard | null> {
  const key = (method || '').trim().toUpperCase();

  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: ['payment_cards_by_method', ...LEGACY_KEYS] } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return resolveFor(key, parseCardMap(map.payment_cards_by_method), map);
}
