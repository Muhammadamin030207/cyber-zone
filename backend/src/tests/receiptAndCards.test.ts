import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateReceiptNumber, reserveReceiptNumber } from '../utils/receiptNumber';
import { resolveMerchantCard, formatCardNumber } from '../utils/merchantCards';

/**
 * CHEK RAQAMI VA DOGAON KARTALARI — qisqa identifikator va usulga
 * bog'langan karta yechimlari.
 *
 * Bu ikkalasi ham to'lovning eng ko'p "noto'g'ri tushuniladigan" qismi:
 * mijoz chek raqamini adminga aytadi, admin shu raqam bo'yicha to'lovni
 * topadi. Raqam noto'g'ri generatsiya qilinsa yoki karta noto'g'ri
 * usulga biriktirilsa — pul yo'qoladi.
 */

vi.mock('../lib/prisma', () => ({
  default: {
    siteSetting: { findMany: vi.fn() },
    payment: { findUnique: vi.fn() },
  },
}));

import prisma from '../lib/prisma';

const mockedSettings = prisma.siteSetting.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedPayment = prisma.payment.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateReceiptNumber', () => {
  it('prefix va 8 belgidan iborat', () => {
    const r = generateReceiptNumber();
    expect(r).toMatch(/^CZ-[0-9A-Z]{8}$/);
  });

  it('chalkash chiqadigan belgilarni ISHLATMAYDI (Crockford Base32)', () => {
    // I, L, O, U — telefon orqali aytganda 1/0 bilan chalkashadi.
    // 5000 ta generatsiya bilan bu belgilar chiqmasligi isbotlanadi.
    for (let i = 0; i < 5000; i++) {
      const body = generateReceiptNumber().slice(3);
      expect(body).not.toMatch(/[ILOU]/);
    }
  });

  it('bir-biridan farq qiladi (taxmin 5000 ta namunada takrorlanish yo\'q)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateReceiptNumber());
    // 32^8 ≈ 1.1e12 kombinatsiya — 5000 ta namuna deyarli kafolatli unikal.
    expect(seen.size).toBe(5000);
  });
});

describe('reserveReceiptNumber', () => {
  it('band bo\'lmagan raqamni qaytaradi', async () => {
    mockedPayment.mockResolvedValueOnce(null);
    const r = await reserveReceiptNumber();
    expect(r).toMatch(/^CZ-[0-9A-Z]{8}$/);
    expect(mockedPayment).toHaveBeenCalledTimes(1);
  });

  it('band bo\'lsa boshqa variantni sinaydi', async () => {
    // Birinchi urinish band, ikkinchisi bo'sh.
    mockedPayment
      .mockResolvedValueOnce({ id: 'band' })
      .mockResolvedValueOnce(null);
    const r = await reserveReceiptNumber();
    expect(r).toMatch(/^CZ-[0-9A-Z]{8}$/);
    expect(mockedPayment).toHaveBeenCalledTimes(2);
  });

  it('5 urinish ham band bo\'lsa xato tashlaydi (checksiz to\'lov yaratilmaydi)', async () => {
    mockedPayment.mockResolvedValue({ id: 'band' });
    await expect(reserveReceiptNumber()).rejects.toThrow('RECEIPT_NUMBER_EXHAUSTED');
    expect(mockedPayment).toHaveBeenCalledTimes(5);
  });
});

describe('formatCardNumber', () => {
  it('bo\'shliqlarni to\'rtliklarga ajratadi', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
  });

  it('avvalgi bo\'shliqlarni tozalaydi', () => {
    expect(formatCardNumber(' 4111 1111 1111 1111 ')).toBe('4111 1111 1111 1111');
  });
});

describe('resolveMerchantCard — usulga bog\'lanish', () => {
  /** `SiteSetting` qatorlarini berish yordamchisi. */
  const rows = (rec: Record<string, string>) =>
    Object.entries(rec).map(([key, value]) => ({ key, value }));

  it('aniq usulga tegishli kartani qaytaradi (UZUM -> Visa)', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({
        payment_cards_by_method: JSON.stringify({
          UZUM: { number: '4111111111111111', holder: 'TEST XAYOT VISA', bank: 'TESTBANK' },
        }),
      })
    );
    const card = await resolveMerchantCard('UZUM');
    expect(card?.number).toBe('4111111111111111');
    expect(card?.holder).toBe('TEST XAYOT VISA');
    expect(card?.numberFormatted).toBe('4111 1111 1111 1111');
  });

  it('boshqa usul boshqa kartani oladi (UZCARD -> o\'z kartasi)', async () => {
    // Ikkala chaqiruv ham bir xil sozlamani o'qiydi — `mockResolvedValue`
    // (Once emas) shu sababli ikkalasi ham ishlaydi.
    mockedSettings.mockResolvedValue(
      rows({
        payment_cards_by_method: JSON.stringify({
          UZUM: { number: '4111111111111111', holder: 'TEST XAYOT VISA' },
          UZCARD: { number: '5614000000001234', holder: 'TEST XAYOT UZCARD' },
        }),
      })
    );
    expect((await resolveMerchantCard('UZUM'))?.number).toBe('4111111111111111');
    expect((await resolveMerchantCard('UZCARD'))?.number).toBe('5614000000001234');
  });

  it('aniq usul yo\'q bo\'lsa DEFAULT ga tushadi', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({
        payment_cards_by_method: JSON.stringify({
          DEFAULT: { number: '1111222233334444', holder: 'Zaxira' },
          UZUM: { number: '4111111111111111', holder: 'TEST XAYOT VISA' },
        }),
      })
    );
    expect((await resolveMerchantCard('PAYME'))?.number).toBe('1111222233334444');
  });

  it('DEFAULT ham bo\'sh bo\'lsa eski payment_card_* ga qaytadi (backward compat)', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({
        payment_cards_by_method: '{}',
        payment_card_number: '9999888877776666',
        payment_card_holder: 'Eski karta',
      })
    );
    const card = await resolveMerchantCard('UZUM');
    expect(card?.number).toBe('9999888877776666');
    expect(card?.holder).toBe('Eski karta');
  });

  it('noto\'g\'ri JSON saqlangan bo\'lsa jimgina eski sozlamaga qaytadi', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({
        payment_cards_by_method: '{bu json emas',
        payment_card_number: '9999888877776666',
      })
    );
    expect((await resolveMerchantCard('UZUM'))?.number).toBe('9999888877776666');
  });

  it('raqam bo\'sh bo\'lsa null qaytaradi (mijoz "karta yo\'q" xatosini ko\'rmasin)', async () => {
    mockedSettings.mockResolvedValueOnce(rows({ payment_cards_by_method: '{}' }));
    expect(await resolveMerchantCard('UZUM')).toBeNull();
  });

  it('raqam yo\'q, faqat holder bor bo\'lsa null (yarim to\'ldirilgan karta ishlatilmaydi)', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({ payment_cards_by_method: JSON.stringify({ UZUM: { holder: 'Faqat ism' } }) })
    );
    expect(await resolveMerchantCard('UZUM')).toBeNull();
  });

  it('XSS sxemasidagi appUrl ni filtrlaydi (javascript: o\'chiriladi)', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({
        payment_cards_by_method: JSON.stringify({
          DEFAULT: { number: '1111222233334444', appUrl: 'javascript:alert(1)' },
        }),
      })
    );
    expect((await resolveMerchantCard('UZUM'))?.appUrl).toBe('');
  });

  it('https appUrl ni saqlaydi', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({
        payment_cards_by_method: JSON.stringify({
          DEFAULT: { number: '1111222233334444', appUrl: 'https://payme.uz' },
        }),
      })
    );
    expect((await resolveMerchantCard('UZUM'))?.appUrl).toBe('https://payme.uz');
  });
});
