import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildReceiptNumber, reserveReceiptNumber, receiptPrefixFor, tashkentLocalDateKey } from '../utils/receiptNumber';
import { resolveMerchantCard, listConfiguredCards, formatCardNumber } from '../utils/merchantCards';

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
    payment: { findUnique: vi.fn(), count: vi.fn() },
  },
}));

import prisma from '../lib/prisma';

const mockedSettings = prisma.siteSetting.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedPayment = prisma.payment.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedCount = prisma.payment.count as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildReceiptNumber — CZ-YYYYMMDD-NNNNNN', () => {
  it('sana va 6 raqamli tartib raqam shaklida', () => {
    const r = buildReceiptNumber(123, new Date('2026-09-28T12:00:00Z'));
    expect(r).toMatch(/^CZ-\d{8}-\d{6}$/);
  });

  it('oldidagi nollar keltiriladi (000123)', () => {
    expect(buildReceiptNumber(123, new Date('2026-09-28T12:00:00Z'))).toBe(`CZ-20260928-000123`);
  });

  it('1 -> 000001, 999999 -> 999999 (chegara)', () => {
    expect(buildReceiptNumber(1, new Date('2026-09-28T12:00:00Z'))).toBe('CZ-20260928-000001');
    expect(buildReceiptNumber(999999, new Date('2026-09-28T12:00:00Z'))).toBe('CZ-20260928-999999');
  });

  it('prefiks kundalik farq qiladi', () => {
    expect(receiptPrefixFor(new Date('2026-09-28T12:00:00Z'))).not.toBe(receiptPrefixFor(new Date('2026-09-29T12:00:00Z')));
  });

  it('Toshkent vaqti (UTC+5) bo\'yicha sana oladi', () => {
    // 2026-09-28 22:30 UTC == 2026-09-29 03:30 Toshkentda
    expect(tashkentLocalDateKey(new Date('2026-09-28T22:30:00Z'))).toBe('20260929');
  });
});

describe('reserveReceiptNumber', () => {
  it('kunning navbatdagi raqamini qaytaradi (count+1)', async () => {
    mockedCount.mockResolvedValueOnce(5);
    mockedPayment.mockResolvedValueOnce(null);
    const r = await reserveReceiptNumber(new Date('2026-09-28T12:00:00Z'));
    expect(r).toBe('CZ-20260928-000006');
  });

  it('band bo\'lsa keyingi raqamni sinaydi (qayta sanash)', async () => {
    // Birinchi urinish band, ikkinchisi bo'sh.
    mockedCount.mockResolvedValueOnce(5);
    mockedPayment
      .mockResolvedValueOnce({ id: 'band' })
      .mockResolvedValueOnce(null);
    mockedCount.mockResolvedValueOnce(5);
    const r = await reserveReceiptNumber(new Date('2026-09-28T12:00:00Z'));
    expect(r).toMatch(/^CZ-20260928-\d{6}$/);
  });

  it('8 urinish ham band bo\'lsa xato tashlaydi (checksiz to\'lov yaratilmaydi)', async () => {
    mockedCount.mockResolvedValue(0);
    mockedPayment.mockResolvedValue({ id: 'band' });
    await expect(reserveReceiptNumber(new Date('2026-09-28T12:00:00Z'))).rejects.toThrow('RECEIPT_NUMBER_EXHAUSTED');
    expect(mockedPayment).toHaveBeenCalledTimes(8);
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

describe('listConfiguredCards — chekout usullar ro\'yxati uchun', () => {
  const rows = (rec: Record<string, string>) =>
    Object.entries(rec).map(([key, value]) => ({ key, value }));

  it('faqat raqami to\'ldirilgan usullarni qaytaradi', async () => {
    mockedSettings.mockResolvedValueOnce(
      rows({
        payment_cards_by_method: JSON.stringify({
          UZUM: { number: '4111111111111111', holder: 'VISA' },
          PAYME: { holder: 'Faqat ism' },
          UZCARD: { number: '5614000000001234', holder: 'UZCARD' },
        }),
      })
    );
    const cards = await listConfiguredCards();
    expect(Object.keys(cards).sort()).toEqual(['UZCARD', 'UZUM']);
    expect(cards.UZUM.number).toBe('4111111111111111');
  });

  it('bo\'sh bo\'lsa bo\'sh obyekt qaytaradi', async () => {
    mockedSettings.mockResolvedValueOnce(rows({ payment_cards_by_method: '{}' }));
    expect(await listConfiguredCards()).toEqual({});
  });
});
