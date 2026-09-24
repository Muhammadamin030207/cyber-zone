import { PrismaClient, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

/**
 * Sodiqlik dasturi — shaxsiy promo-kodlarni avtomatik berish (§3).
 *
 * Foydalanuvchi umumiy to'langan summa chegaralarini oshganda unga SHAXSIY
 * promo-kod (isPersonal=true, aniq recipientUserId bilan) beriladi. Kod faqat
 * shu foydalanuvchi tomonidan va faqat tasdiqlangan shaxs bilan ishlatiladi.
 *
 * Har bir chegara uchun faqat 1 marta beriladi (code yaratilgandan keyin
 * takrorlanmaydi — idempotent). Notifikatsiya orqali foydalanuvchi xabardor
 * qilinadi.
 */
const LOYALTY_TIERS: Array<{ prefix: string; minSpend: number; discountValue: number; label: string }> = [
  { prefix: 'USTOZ10', minSpend: 500_000, discountValue: 10, label: "VIP mehmon" },
  { prefix: 'USTOZ15', minSpend: 1_000_000, discountValue: 15, label: "Doimiy mehmon" },
  { prefix: 'USTOZ20', minSpend: 3_000_000, discountValue: 20, label: "Premium mehmon" },
];

const PROMO_VALID_DAYS = 30;

// Ruxsat etilgan belgilar to'plami (0/O, 1/I kabi noaniq belgilarsiz).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSuffix(len: number): string {
  let out = '';
  const bytes = randomBytes(len);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export async function maybeGrantLoyaltyPromo(
  client: Prisma.TransactionClient | PrismaClient,
  userId: string
): Promise<Array<{ code: string; discountValue: number }>> {
  const granted: Array<{ code: string; discountValue: number }> = [];

  // Umumiy to'langan summa: faqat COMPLETED/PAID to'lovlar (server tasdiqlagan pul).
  const paidAgg = await client.payment.aggregate({
    where: { userId, status: { in: ['PAID', 'COMPLETED'] } },
    _sum: { amount: true },
  });
  const totalSpend = Number(paidAgg._sum.amount || 0);

  for (const tier of LOYALTY_TIERS) {
    if (totalSpend < tier.minSpend) continue;

    const already = await client.promoCode.findFirst({
      where: {
        recipientUserId: userId,
        isPersonal: true,
        code: { startsWith: tier.prefix },
      },
      select: { id: true },
    });
    if (already) continue;

    // Unique code yaratish (ziddiyat bo'lsa qaytadan urinamiz)
    let code = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `${tier.prefix}-${randomSuffix(4)}`;
      const exists = await client.promoCode.findUnique({ where: { code: candidate } });
      if (!exists) { code = candidate; break; }
    }
    if (!code) continue;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PROMO_VALID_DAYS * 86_400_000);

    await client.promoCode.create({
      data: {
        roomId: null, // platforma bo'ylab (istalgan xonada ishlatiladi)
        code,
        discountType: 'PERCENTAGE',
        discountValue: tier.discountValue,
        minBookingAmount: 100_000, // abuse himoyasi: kamida 100 000 so'm bron
        usageScope: 'MULTI_USE',
        maxUses: 2, // jami 2 marta ishlatilishi mumkin
        usageLimitPerUser: 2, // har bir foydalanuvchiga 2 marta
        isPersonal: true,
        recipientUserId: userId,
        startsAt: now,
        expiresAt,
        createdBy: userId,
      },
    });

    await client.notification.create({
      data: {
        userId,
        title: 'Sizga shaxsiy promo-kod berildi',
        message: `${tier.label} — ${code} kodi orqali keyingi broningizga ${tier.discountValue}% chegirma (30 kun amal qiladi).`,
        type: 'promo',
      },
    });

    granted.push({ code, discountValue: tier.discountValue });
  }

  return granted;
}