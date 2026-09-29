import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Promo-kod anti-abuse identifikatsiyasi (§3).
 *
 * Bir "shaxs" = userId + AYNAN bir xil telefon raqamiga ega barcha akkauntlar
 * ("twin" akkauntlar). Faqat IP EMAS — IP turli qurilmalarda almashinadi va
 * abuse'ga qarshi ishonchli identifikator emas.
 *
 * BU YORDAMCHI hali TO'LIQ himoya EMAS — qoldiq chekka:
 *   `User.phone` — ixtiyoriy, `@@unique` EMAS va bu kod bazasida hech qachon
 *   SMS orqali TASDIQLANMAYDI. Shu sababli foydalanuvchi har gal boshqa
 *   telefon (yoki hech qanday telefon) bilan yangi akkaunt ochib, per-user
 *   limitni nolga qaytara oladi.
 *   To'liq yechim = telefon OTP-tasdiqlash + `phone` ga `@@unique` (alohida
 *   infratuzilma: SMS provayderi). Hozircha tweet darajasidagi himoya —
 *   `maxUses` global chegarasi BRON paytida transaktsiya ichida tekshiriladi
 *   (booking.controller.ts), ya'ni twin-abuse promo byudjetini chegaradan
 *   oshirib chiqara olmaydi, faqat chegarani to'ldiradi.
 *
 * Bu yordamchi server kodida (booking yaratish) ham, shaxsiy promo-kodlarni
 * ro'yxatlashda ham bir xil identifikatsiyani kafolatlaydi.
 */
export async function getPromoIdentityIds(
  client: Prisma.TransactionClient | PrismaClient,
  userId: string
): Promise<string[]> {
  const me = await client.user.findUnique({ where: { id: userId }, select: { phone: true } });
  const ids = [userId];
  if (me?.phone) {
    const twins = await client.user.findMany({
      where: { phone: me.phone, id: { not: userId } },
      select: { id: true },
    });
    if (twins.length) ids.push(...twins.map((t: any) => t.id));
  }
  return ids;
}

/**
 * Ko'p sibling akkauntlar orasidan bir xil telefonni ajratib beradi —
 * keyinchalik advisory lock'lar shu ID'lar bo'yicha olinadi.
 */
export async function getPromoIdentityLockIds(
  client: Prisma.TransactionClient | PrismaClient,
  userId: string
): Promise<string[]> {
  return getPromoIdentityIds(client, userId);
}

export interface PromoRecipientCheck {
  userId: string;
  phone?: string | null;
  email?: string;
  identityIds: string[];
}

/**
 * SHAXSIY promo-kod (isPersonal) qabul qiluvchisi shu foydalanuvchimi?
 * Identifikatsiya: recipientUserId (userId/twin'lardan biri) YOKI tasdiqlangan
 * telefon YOKI email. IP hech qachon ishlatilmaydi.
 */
export function isPromoRecipient(
  promo: { isPersonal?: boolean; recipientUserId?: string | null; recipientPhone?: string | null; recipientEmail?: string | null },
  ctx: PromoRecipientCheck
): boolean {
  if (!promo.isPersonal) return true;
  const targetId = promo.recipientUserId ? String(promo.recipientUserId) : null;
  if (targetId && ctx.identityIds.includes(targetId)) return true;
  const targetPhone = promo.recipientPhone ? String(promo.recipientPhone).trim().replace(/[\s()-]/g, '') : '';
  const myPhone = ctx.phone ? String(ctx.phone).trim().replace(/[\s()-]/g, '') : '';
  if (targetPhone && targetPhone === myPhone) return true;
  const targetEmail = promo.recipientEmail ? String(promo.recipientEmail).trim().toLowerCase() : '';
  const myEmail = ctx.email ? String(ctx.email).trim().toLowerCase() : '';
  if (targetEmail && targetEmail === myEmail) return true;
  return false;
}