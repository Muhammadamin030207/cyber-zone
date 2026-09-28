import { Request, Response, NextFunction } from 'express';
import { isProduction } from '../config/runtime';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';
import { toNumber, round2, isValidAmount } from '../utils/money';
import { resolveDepositPercent } from '../utils/pricing';
import { resolveMerchantCard, listConfiguredCards } from '../utils/merchantCards';
import { reserveReceiptNumber } from '../utils/receiptNumber';
import { io } from '../lib/socket';
import { Prisma } from '@prisma/client';
import { getProvider, getProviderAvailability, isProviderAvailable, ProviderNotConfiguredError, ProviderUnavailableError, SANDBOX_CLICK, SANDBOX_PAYME, SANDBOX_UZUM, SANDBOX_PAYNET } from '../services/payments';
import { hmacSha256hex, md5hex } from '../services/payments/crypto';
import { config } from '../config';
import { paymentsSandbox, sandboxOrigin, setSandboxForced } from '../config/paymentsRuntime';

type TxClient = Prisma.TransactionClient;

const PAID_STATUSES = ['PAID', 'COMPLETED'] as const;

// ============ YORDAMCHILAR ============

const STATUS_RANK: Record<string, number> = {
  PENDING: 0,
  PENDING_PAYMENT: 1,
  PARTIALLY_PAID: 2,
  PAID: 3,
  CONFIRMED: 4,
  ACTIVE: 5,
  COMPLETED: 6,
  CANCELLED: -1,
};

function paidAmount(payments: Array<{ amount: any; status: string }>): number {
  let sum = 0;
  for (const p of payments) {
    if ((PAID_STATUSES as readonly string[]).includes(p.status)) sum = round2(sum + round2(toNumber(p.amount)));
  }
  return round2(sum);
}

async function auditLog(
  tx: TxClient,
  args: { paymentId: string; action: string; actorId?: string | null; actorRole?: string | null; metadata?: Record<string, any> }
) {
  await tx.paymentAuditLog.create({
    data: {
      paymentId: args.paymentId,
      action: args.action,
      actorId: args.actorId || null,
      actorRole: args.actorRole || null,
      metadata: (args.metadata as any) || undefined,
    },
  });
}

/**
 * Bonus ball berish — har bir muvaffaqiyatli to'lovda (1% ball = so'm).
 * Faqat to'lov birinchi marta PAID holatiga o'tganda to'lanadi (idempotent).
 */
async function awardPoints(tx: TxClient, args: { userId: string; bookingId: string; amount: number; description?: string }) {
  const earn = Math.floor(toNumber(args.amount) * 0.01);
  if (earn <= 0) return 0;
  const user = await tx.user.update({
    where: { id: args.userId },
    data: { loyaltyBalance: { increment: earn } },
    select: { loyaltyBalance: true },
  });
  await tx.loyaltyTransaction.create({
    data: {
      userId: args.userId,
      type: 'EARN',
      amount: earn,
      balanceAfter: user.loyaltyBalance,
      description: args.description || `${earn} ball to'lov uchun qo'shildi`,
      bookingId: args.bookingId,
    },
  });
  return earn;
}

interface BookingInfo {
  id: string;
  roomId: string;
  finalPrice: any;
  depositPercent: number;
  status: string;
  userId: string;
}

/**
 * To'lovni PAID qiladi (birinchi marta — idempotent), so'ng bronni
 * yangi moliyaviy holatga o'tkazadi:
 *   - jami to'lov == finalPrice        → PAID (to'liq to'langan)
 *   - jami to'lov >= depozit talabi    → PARTIALLY_PAID
 * Bron hech qachon qaytgan bosqichga tushirilmaydi.
 */
async function settleVerifiedPayment(
  tx: TxClient,
  args: { id: string; actorId?: string | null; actorRole?: string | null; audit?: Record<string, any>; providerTransactionId?: string | null; providerPaymentId?: string | null }
) {
  const now = new Date();
  const timed = await tx.payment.updateMany({
    where: { id: args.id, status: { notIn: [...PAID_STATUSES] } },
    data: {
      status: 'PAID',
      paidAt: now,
      ...(args.providerTransactionId ? { providerTransactionId: args.providerTransactionId } : {}),
      ...(args.providerPaymentId ? { providerPaymentId: args.providerPaymentId } : {}),
    },
  });
  if (timed.count === 0) {
    const already = await tx.payment.findUnique({ where: { id: args.id } });
    return { settled: false, paid: already, booking: null, totalPaid: 0 };
  }

  await auditLog(tx, {
    paymentId: args.id,
    action: 'payment_verified',
    actorId: args.actorId,
    actorRole: args.actorRole,
    metadata: { ...(args.audit || {}), paidAt: now.toISOString() },
  });

  const paid = await tx.payment.findUnique({ where: { id: args.id } });
  if (!paid) return { settled: false, paid: null, booking: null, totalPaid: 0 };

  const payments = await tx.payment.findMany({
    where: { bookingId: paid.bookingId, status: { in: [...PAID_STATUSES] } },
    select: { amount: true, status: true },
  });
  const totalPaid = paidAmount(payments);

  const booking: BookingInfo | null = await tx.booking.findUnique({
    where: { id: paid.bookingId },
    select: { id: true, roomId: true, finalPrice: true, depositPercent: true, status: true, userId: true },
  });
  if (!booking) return { settled: true, paid, booking: null, totalPaid };

  const finalPrice = round2(toNumber(booking.finalPrice));
  const requiredDeposit = round2((finalPrice * booking.depositPercent) / 100);

  let nextStatus: string | null = null;
  if (totalPaid >= finalPrice - 0.004) nextStatus = 'PAID';
  else if (totalPaid >= requiredDeposit - 0.004) nextStatus = 'PARTIALLY_PAID';

  let updatedBooking: any = null;
  if (nextStatus && (STATUS_RANK[nextStatus] ?? -1) > (STATUS_RANK[booking.status] ?? -1)) {
    updatedBooking = await tx.booking.update({
      where: { id: booking.id },
      data: { status: nextStatus as any },
      include: { room: { select: { id: true, ownerId: true } } },
    });
    await auditLog(tx, {
      paymentId: paid.id,
      action: nextStatus === 'PAID' ? 'booking_fully_paid' : 'booking_partially_paid',
      actorId: args.actorId,
      actorRole: args.actorRole,
      metadata: { bookingId: booking.id, totalPaid, finalPrice, depositPercent: booking.depositPercent },
    });
  }

  // Bonus ballari — to'lov summasi uchun
  await awardPoints(tx, { userId: booking.userId, bookingId: booking.id, amount: toNumber(paid.amount) });

  return { settled: true, paid, booking: updatedBooking, totalPaid };
}

function bookingInfoOf(payment: any): { roomId?: string; bookingId?: string; computerId?: string } {
  return {
    roomId: payment?.booking?.room?.id ?? payment?.booking?.roomId,
    bookingId: payment?.bookingId,
    computerId: payment?.booking?.computerId,
  };
}

/** Provider callback URL — serverga qaytadigan (webhook) mutlaq manzil */
function providerCallbackUrl(method: string): string {
  const base = config.payments.callbackBaseUrl || `http://localhost:${config.port}`;
  return `${base.replace(/\/$/, '')}/api/payments/webhook/${method.toLowerCase()}`;
}

function normalizeMethod(method: string): { method: string; providerId: string; cash: boolean; manual: boolean } {
  const m = String(method || '').toUpperCase();
  if (m === 'CASH') return { method: 'CASH', providerId: '', cash: true, manual: false };
  // QO'LDA O'TKAZMA: foydalanuvchi o'z bank ilovasida dogaon kartasiga
  // pul o'tkazadi, chek (screenshot) yuboradi, admin bank hisobida tekshiradi.
  // Provayder YO'Q, shuning uchun checkoutUrl ham chiqmaydi.
  if (m === 'TRANSFER') return { method: 'TRANSFER', providerId: '', cash: false, manual: true };
  if (['PAYME', 'CLICK', 'UZUM', 'PAYNET'].includes(m)) {
    return { method: m, providerId: m, cash: false, manual: false };
  }
  // Legacy nomlar -> provider'ga moslash
  const legacy: Record<string, string> = { UZCARD: 'PAYME', HUMO: 'PAYME' };
  if (legacy[m]) return { method: m, providerId: legacy[m], cash: false, manual: false };
  return { method: '', providerId: m, cash: false, manual: false };
}

// ============ POST /api/payments/create — USER: to'lov sessiyasi yaratish ============
export const createPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // catch bloki ham ishlatishi uchun try tashqarisida e'lon qilinadi
  let idemKey: string | null = null;
  try {
    const { bookingId, method, depositPercent, idempotencyKey } = req.body as { bookingId?: string; method?: string; depositPercent?: number; idempotencyKey?: string };

    if (!bookingId) return badRequest(res, 'bookingId majburiy');
    if (!method) return badRequest(res, 'method majburiy');
    if (depositPercent !== undefined && (!Number.isInteger(depositPercent) || depositPercent < 1 || depositPercent > 100)) {
      return badRequest(res, 'Depozit foizi 1-100 oralig\'ida bo\'lishi kerak');
    }

    // Idempotency: bir xil kalit bilan yuborilgan so'rov bitta to'lovni yaratadi.
    idemKey = typeof idempotencyKey === 'string' && idempotencyKey.trim()
      ? idempotencyKey.trim().slice(0, 64)
      : null;
    if (idemKey) {
      const already = await prisma.payment.findUnique({ where: { idempotencyKey: idemKey } });
      if (already) {
        return ok(res, {
          payment: {
            id: already.id,
            status: already.status,
            amount: already.amount,
            method: already.method,
            provider: already.provider,
            depositPercent: already.depositPercent,
          },
          checkoutUrl: null,
          resumed: true,
          idempotent: true,
        });
      }
    }

    const normalized = normalizeMethod(method);
    let { method: normMethod, providerId, cash, manual } = normalized;
    if (!cash && !manual && !providerId) {
      return badRequest(res, 'To\'lov metodi qo\'llab-quvvatlanmaydi');
    }

    let provider = null;
    let checkoutUrl: string | null = null;
    if (!cash && !manual) {
      try {
        provider = getProvider(providerId);
      } catch {
        return badRequest(res, `Noma'lum to'lov metodi: ${method}`);
      }
      if (!isProviderAvailable(providerId)) {
        // Provayder GATEWAY sozlanmagan bo'lsa — lekin shu usul uchun DOGAON
        // (merchant) kartasi sozlangan bo'lsa, qo'lda o'tkazma rejimiga tushamiz.
        // Mijoz kartani nusxalaydi, ilovada o'tkazadi, chek yuboradi.
        const fallbackCard = await resolveMerchantCard(method);
        if (fallbackCard) {
          provider = null;
          manual = true;
        } else {
          return badRequest(res, provider.label + ' to\'lov xizmati hozircha mavjud emas. Iltimos, boshqa usulni tanlang (naqd pul).');
        }
      }
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { room: true },
    });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res, 'Bu bron sizniki emas');
    if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
      return badRequest(res, 'Bu bron uchun to\'lov mumkin emas');
    }

    // Muddati o'tgan eski sessiyalarni tozalaymiz (yopiq checkout qoldiqlari)
    if (!cash && !manual) {
      const stale = await prisma.payment.findMany({
        where: {
          bookingId,
          status: { in: ['CREATED', 'REDIRECT_REQUIRED', 'PROCESSING'] },
          expiresAt: { lt: new Date() },
        },
        select: { id: true },
      });
      if (stale.length) {
        await prisma.$transaction(async (tx) => {
          await tx.payment.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { status: 'EXPIRED' } });
          for (const s of stale) await auditLog(tx, { paymentId: s.id, action: 'payment_expired', actorId: req.user!.userId, actorRole: 'SYSTEM', metadata: { source: 'create_cleanup' } });
        });
      }
    }

    // Idempotentlik: bu bron uchun hali yaroqli (muddati o'tmagan) aktiv onlayn
    // sessiya mavjud bo'lsa — yangi to'lov YARATMAYMIZ, mavjudini qaytaramiz.
    // Bu "refresh/bosish" vaqtida duplicate sessionlar va overpay oldini oladi.
    if (!cash && !manual) {
      const active = await prisma.payment.findFirst({
        where: {
          bookingId,
          status: { in: ['CREATED', 'REDIRECT_REQUIRED', 'PROCESSING'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true, status: true, amount: true, depositPercent: true },
      });
      if (active) {
        // Provayder uchun yangi checkout URL qayta olinadi (bir xil paymentId —
        // merchant trans id o'zgarmaydi), aks holda sessiya tiklanadi.
        let checkoutUrl: string | null = null;
        if (provider) {
          try {
            const prepared = await provider.createPayment({
              paymentId: active.id,
              bookingId: booking.id,
amount: Number(active.amount),
              currency: 'UZS',
              depositPercent: active.depositPercent,
              description: `Cyber-ZONE bron ${booking.id}`,
              callbackUrl: providerCallbackUrl(providerId),
              returnUrl: `${config.frontendUrls[0] || ''}/checkout/${booking.id}/pay?pid=${active.id}`,
              userId: req.user!.userId,
              sandboxBaseUrl: sandboxOrigin(req),
            });
            checkoutUrl = prepared.checkoutUrl;
            await prisma.payment.update({
              where: { id: active.id },
              data: { expiresAt: prepared.expiresAt || new Date(Date.now() + 30 * 60 * 1000) },
            });
          } catch {
            /* eski sessiya o'z holicha davom etadi */
          }
        }
        return created(res, {
          payment: {
            id: active.id,
            status: active.status,
            amount: active.amount,
            method: normMethod || null,
            provider: providerId || null,
            depositPercent: active.depositPercent,
          },
          checkoutUrl,
          resumed: true,
          depositPercent: active.depositPercent,
          amount: active.amount,
        }, 'Oldingi to\'lov sessiyasi tiklandi');
      }
    }

    const finalPrice = round2(toNumber(booking.finalPrice));
    const prevPayments = await prisma.payment.findMany({
      where: { bookingId, status: { in: [...PAID_STATUSES] } },
      select: { amount: true, status: true },
    });
    const totalPaid = paidAmount(prevPayments);
    if (totalPaid >= finalPrice - 0.004) return badRequest(res, 'Bron to\'liq to\'langan');

    // Depozit foizi — server AVTORITETI bronda: `booking.depositPercent` bu
    // bronni KIRISH uchun talab qilinadigan MINIMUM. Mijoz bu chegaradan
    // KAM pul to'lashi mumkin emas (aks holda tasdiqlash chegarasini chetlab
    // o'tadi) — shuning uchun pastga cheklaymiz.
    //
    // Lekin YUQORIGA erkin: mijoz xohlagan foizda (50%, 70%...) yoki to'liq
    // (100%) to'lashi mumkin. Masalan 30% deponi bor, mijoz to'liq to'lashni
    // tanlasa — `percent = 100`, qoldiq 0, bitta to'lovda hamma yopiladi.
    // Tanlangan foiz bronga yoziladi, shuning uchun keyingi qoldiq to'lov
    // aynan shu foiz bo'yicha qoladi.
    const minPercent = Math.min(
      100,
      Math.max(config.payments.minDepositPercent, resolveDepositPercent(booking.depositPercent))
    );
    // So'rovdagi foiz faqat yuqoriga yo'naltiradi. `Math.round` — UI foizni
    // qadamlar (10/25/50/100) bo'yicha beradi, lekin kelajakda boshqa
    // qiymat kelsa ham butun songa yaxlitlanadi.
    const requestedPercent = depositPercent === undefined
      ? minPercent
      : Math.min(100, Math.max(minPercent, Math.round(Number(depositPercent))));
    const percent = requestedPercent;
    const requiredDeposit = round2((finalPrice * percent) / 100);
    const depositAlreadyPaid = round2(Math.min(totalPaid, requiredDeposit));
    const amount = round2(Math.max(0, requiredDeposit - depositAlreadyPaid));

    if (!isValidAmount(amount)) return badRequest(res, 'To\'lov miqdori noto\'g\'ri');
    if (amount > round2(finalPrice - totalPaid) + 0.004) {
      return badRequest(res, `To'lov miqdori qoldiqdan oshmaydi. Qoldiq: ${round2(finalPrice - totalPaid)} so'm`);
    }

    // Bron depozit foizini yozamiz (avans/remaining ham shunga moslab yangilanadi)
    const newAdvance = round2((finalPrice * percent) / 100);
    const newRemaining = round2(Math.max(0, finalPrice - newAdvance));
    const normalizedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: { depositPercent: percent, advanceAmount: newAdvance, remainingAmount: newRemaining },
    });

    const isAdvance = amount < round2(finalPrice - totalPaid) - 0.004;

    // CHEK RAQAMI — mijoz bank ilovasida to'lagandan keyin shu raqamni
    // yozadi (izohga) yoki adminga aytadi; admin aynan shu raqam bo'yicha
    // to'lovni topadi. UUID o'rniga qisqa, o'qiladigan `CZ-7K2M9QX4`.
    const receiptNumber = await reserveReceiptNumber();

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          bookingId,
          userId: req.user!.userId,
          amount,
          type: isAdvance ? 'ADVANCE' : 'REMAINING',
          method: cash ? 'CASH' : (normMethod || null) as any,
          // manual (TRANSFER) uchun provider YO'Q — null bo'lishi SHART
          provider: (!cash && !manual ? providerId : null) as any,
          // CASH va TRANSFER: checkout sessiyasi yo'q -> PENDING (admin kutadi)
          status: cash || manual ? 'PENDING' : 'CREATED',
          currency: 'UZS',
          depositPercent: percent,
          idempotencyKey: idemKey,
          receiptNumber,
          metadata: (cash
            ? null
            : manual
              ? { manualTransfer: true, manualMethod: 'card_transfer', method: (normMethod || 'TRANSFER'), instruction: "Karta raqamiga o'tkazing, chek yuboring" }
              : { providerMethod: providerId.toLowerCase() }) as any,
        },
      });
      await auditLog(tx, { paymentId: p.id, action: 'payment_created', actorId: req.user!.userId, actorRole: req.user!.role as string, metadata: { method, percent, amount, receiptNumber } });
      return p;
    });

    // Online to'lov — provider checkout sessiyasi
    if (!cash && provider) {
      try {
        const prepared = await provider.createPayment({
          paymentId: payment.id,
          bookingId: booking.id,
          amount,
          currency: 'UZS',
          depositPercent: percent,
          description: `Cyber-ZONE bron ${booking.id}`,
          callbackUrl: providerCallbackUrl(providerId),
          returnUrl: `${config.frontendUrls[0] || ''}/checkout/${booking.id}/pay?pid=${payment.id}`,
          userId: req.user!.userId,
          sandboxBaseUrl: sandboxOrigin(req),
        });

        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: prepared.status === 'REDIRECT_REQUIRED' ? 'REDIRECT_REQUIRED' : prepared.status === 'PROCESSING' ? 'PROCESSING' : 'CREATED',
              providerTransactionId: prepared.providerTransactionId || null,
              providerPaymentId: prepared.providerPaymentId || null,
              expiresAt: prepared.expiresAt || new Date(Date.now() + 30 * 60 * 1000),
              metadata: { ...((payment.metadata as any) || {}), ...(prepared.raw || {}) } as any,
            },
          });
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'PENDING_PAYMENT' as any },
          });
          await auditLog(tx, {
            paymentId: payment.id,
            action: 'redirect_generated',
            actorId: req.user!.userId,
            actorRole: req.user!.role as string,
            metadata: { checkoutUrl: prepared.checkoutUrl, providerTransactionId: prepared.providerTransactionId },
          });
        });

        checkoutUrl = prepared.checkoutUrl;
      } catch (err) {
        // Provider bilan bog'lanishda xato — to'lovni bekor qilib, foydalanuvchiga xabar beramiz
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: (err as Error).message } });
          await tx.booking.update({ where: { id: booking.id }, data: { status: 'PENDING' } });
          await auditLog(tx, {
            paymentId: payment.id,
            action: 'payment_failed',
            actorId: req.user!.userId,
            actorRole: req.user!.role as string,
            metadata: { reason: (err as Error).message },
          });
        });
        if (err instanceof ProviderNotConfiguredError) {
          return badRequest(res, err.message);
        }
        if (err instanceof ProviderUnavailableError) {
          return res.status(503).json({ success: false, message: err.message, code: 'PROVIDER_UNAVAILABLE' });
        }
        return res.status(502).json({ success: false, message: 'To\'lov xizmati bilan bog\'lanishda xatolik yuz berdi' });
      }
    }

    // QO'LDA O'TKAZMA — bron "to'lov kutilmoqda" holatiga o'tadi, admin
    // xabardor qilinadi. Dogaon karta ma'lumotlari frontend'ga qaytariladi
    // (mijoz nusxalaydi). Karta raqami ommaviy endpointda emas, shu
    // autentifikatsiyalangan javobda bor.
    if (manual) {
      // Har bir usulga alohida dogaon karta (UZUM -> VISA, UZCARD -> o'z kartasi).
      const merchantCard = await resolveMerchantCard(method);

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'PENDING_PAYMENT' as any } });
        await auditLog(tx, {
          paymentId: payment.id,
          action: 'payment_created',
          actorId: req.user!.userId,
          actorRole: req.user!.role as string,
          metadata: { method: normMethod || 'TRANSFER', percent, amount, cardConfigured: Boolean(merchantCard) },
        });
      });

      await prisma.notification.create({
        data: {
          userId: booking.room.ownerId,
          title: "O'tkazma to'lovi kutilmoqda",
          message: `${amount.toLocaleString('ru-RU')} so'm karta orqali o'tkaziladi. Mijoz chek yuborgach bank hisobida tekshirib tasdiqlang.`,
          type: 'payment',
        },
      });
      io.to(`user:${booking.room.ownerId}`).emit('notification_new', { userId: booking.room.ownerId, type: 'payment' });

      return created(res, {
        payment,
        checkoutUrl: null,
        manual: true,
        merchantCard,
        depositPercent: percent,
        requiredDeposit: round2(Math.max(0, requiredDeposit - totalPaid)),
        amount,
      }, "To'lov sessiyasi yaratildi");
    }

    // CASH to'lov — admin kassada qabul qiladi
    if (cash) {
      await prisma.notification.create({
        data: {
          userId: booking.room.ownerId,
          title: 'Yangi kassa to\'lovi kutilmoqda',
          message: `${amount.toLocaleString('ru-RU')} so'm depozit to'lov kassada. Tasdiqlash kerak.`,
          type: 'payment',
        },
      });
      io.to(`user:${booking.room.ownerId}`).emit('notification_new', { userId: booking.room.ownerId, type: 'payment' });
    }

    return created(res, {
      payment,
      checkoutUrl,
      depositPercent: percent,
      requiredDeposit: round2(Math.max(0, requiredDeposit - totalPaid)),
      amount,
    }, 'To\'lov sessiyasi yaratildi');
  } catch (err) {
    // Parallel so'rovlar: bir xil idempotency kaliti bilan ikkinchisi unique constraint'ga uriladi.
    // Bu xato emas — ikkinchi so'rov birinchisining natijasini oladi.
    const code = (err as { code?: string })?.code;
    if (code === 'P2002' && idemKey) {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey: idemKey } });
      if (existing) {
        return ok(res, {
          payment: {
            id: existing.id,
            status: existing.status,
            amount: existing.amount,
            method: existing.method,
            provider: existing.provider,
            depositPercent: existing.depositPercent,
          },
          checkoutUrl: null,
          resumed: true,
          idempotent: true,
        });
      }
    }
    next(err);
  }
};

// ============ GET /api/payments/providers — To'lov xizmatlari holati ============
export const getProviders = async (_req: Request, res: Response) => {
  return ok(res, {
    providers: getProviderAvailability(),
    minDepositPercent: config.payments.minDepositPercent,
    sandbox: paymentsSandbox(),
  });
};

// ============ GET/PUT /api/payments/admin/sandbox — SUPER_ADMIN: test rejimi ============
export const getSandboxState = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: 'payments.sandbox' } });
    return ok(res, {
      enabled: paymentsSandbox(),
      stored: row?.value === 'on',
      devModeEnv: config.payments.devMode,
    });
  } catch (err) {
    next(err);
  }
};

export const setSandboxState = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    // PRODUCTION'DA TO'LOV TEST REJIMI YOQILMAYDI (spec §3). DB'ga ham
    // yozilmaydi — aks holda keyingi boot'da "on" qiymatini o'qib, holat
    // chalkash bo'lardi (barchaqli no-op).
    if (isProduction() && enabled) {
      return res.status(403).json({
        success: false,
        error: 'Production muhitda to\'lov test rejimini yoqib bo\'lmaydi',
        code: 'SANDBOX_FORBIDDEN_IN_PRODUCTION',
      });
    }
    await prisma.siteSetting.upsert({
      where: { key: 'payments.sandbox' },
      update: { value: enabled ? 'on' : 'off', updatedBy: req.user?.userId },
      create: { key: 'payments.sandbox', value: enabled ? 'on' : 'off', updatedBy: req.user?.userId },
    });
    setSandboxForced(enabled);
    return ok(res, { enabled: paymentsSandbox() }, enabled ? 'To\'lov test rejimi yoqildi' : 'To\'lov test rejimi o\'chirildi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments/mock/:provider — SANDBOX mock gateway ============
// Runtime sandbox holatida ochiladi. Provayder "checkout"ini simulyatsiya qiladi:
// to'lovni yakunlab, IMZOLANGAN webhook orqali yuboradi. Webhook validatsiyasi
// (Click sign_string yoki Payme Basic auth) HAMON majburiy — shuning uchun
// "soxta PAID" texnik jihatdan imkonsiz. Haqiqiy pul olinmaydi.
export const mockSandboxPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!paymentsSandbox()) return res.status(404).json({ error: 'not found' });
    const mockKey = String(req.query.mock_key || '');
    if (mockKey !== config.payments.devMockKey) return res.status(404).json({ error: 'not found' });

    const provider = String(req.params.provider || '').toLowerCase();
    if (!['click', 'payme', 'uzum', 'paynet'].includes(provider)) return res.status(400).json({ error: 'unknown provider' });

    const q = req.query as Record<string, string | undefined>;
    const orderId = String(q.order_id || q.merchant_trans_id || q['ac.order_id'] || q.account || '');
    if (!orderId) return res.status(400).json({ error: 'order_id majburiy' });

    const payment = await prisma.payment.findFirst({
      where: { OR: [{ id: orderId }, { providerTransactionId: orderId }, { providerPaymentId: orderId }] },
    });
    if (!payment) return res.status(404).json({ error: 'To\'lov topilmadi' });
    if (!['CREATED', 'REDIRECT_REQUIRED', 'PROCESSING'].includes(payment.status)) {
      return res.status(409).json({ error: `To'lov holati ${payment.status} — yakunlangan` });
    }

    const amount = round2(toNumber(payment.amount));
    const origin = `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${origin}/api/payments/webhook/${provider}`;
    const now = new Date();
    const signTime = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    let hookRes: any;
    if (provider === 'click') {
      const c = config.payments.click;
      const creds = c.serviceId && c.secretKey ? { serviceId: c.serviceId, secretKey: c.secretKey } : SANDBOX_CLICK;
      const clickTransId = `dev-${Date.now()}`;
      const params = new URLSearchParams({
        action: '1',
        click_trans_id: clickTransId,
        service_id: creds.serviceId,
        click_paydoc_id: `dev-${payment.id}`,
        merchant_trans_id: orderId,
        amount: String(Math.round(amount)),
        sign_time: signTime,
      });
      params.set('sign_string', md5hex([clickTransId, creds.serviceId, creds.secretKey, orderId, String(Math.round(amount)), '1', signTime].join('')));
      hookRes = await fetch(`${webhookUrl}?${params.toString()}`, { method: 'POST', signal: AbortSignal.timeout(15000) });
    } else if (provider === 'payme') {
      const p = config.payments.payme;
      const creds = p.merchantId && p.merchantKey ? { merchantId: p.merchantId, merchantKey: p.merchantKey } : SANDBOX_PAYME;
      const basic = Buffer.from(`${creds.merchantId}:${creds.merchantKey}`).toString('base64');
      hookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
        body: JSON.stringify({
          method: 'PerformTransaction',
          params: { id: orderId, amount: Math.round(round2(amount) * 100), account: { order_id: orderId } },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } else if (provider === 'uzum') {
      const u = config.payments.uzum;
      const creds = u.merchantId && u.secretKey ? { merchantId: u.merchantId, secretKey: u.secretKey } : SANDBOX_UZUM;
      const body = {
        orderNumber: orderId,
        orderId,
        operationState: 'SUCCESS',
        amount: Math.round(round2(amount) * 100), // tiyin
      };
      const bodyStr = JSON.stringify(body);
      // Uzum imzosi aynan raw body ustidan — mock ham aynan o'sha baytlarni jo'natadi.
      const sign = hmacSha256hex(creds.secretKey, bodyStr);
      hookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sign': sign,
          'X-Terminal-Id': creds.merchantId,
        },
        body: bodyStr,
        signal: AbortSignal.timeout(15000),
      });
    } else if (provider === 'paynet') {
      const pn = config.payments.paynet;
      const creds = pn.merchantId && pn.password ? { merchantId: pn.merchantId, password: pn.password } : SANDBOX_PAYNET;
      const basic = Buffer.from(`${creds.merchantId}:${creds.password}`).toString('base64');
      hookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'PerformTransaction',
          params: {
            transactionId: `dev-${Date.now()}`,
            account: orderId,
            amount: Math.round(round2(amount) * 100), // tiyin
            fields: { id: orderId },
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      return res.status(400).json({ error: 'unknown provider' });
    }

    const body = await hookRes.text();
    if (!hookRes.ok) {
      return res.status(502).json({ error: 'webhook rad etildi', provider, response: body });
    }

    const returnUrl = String(q.return_url || '');
    if (returnUrl.startsWith('http')) {
      return res.redirect(302, returnUrl);
    }
    return res.json({ ok: true, provider, payment: payment.id, status: 'PAID (sandbox)' });
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments/:id/status — USER: to'lov holati (poll + verify) ============
const lastVerifyAt = new Map<string, number>();

export const getPaymentByIdStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { booking: { include: { room: { select: { id: true, ownerId: true } } } } },
    });
    if (!payment) return notFoundMsg(res, 'To\'lov topilmadi');
    if (payment.userId !== req.user!.userId && payment.booking.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res, 'Bu to\'lov sizniki emas');
    }

    const isOnline = (payment.metadata as any)?.providerMethod || (payment.method && payment.method !== 'CASH');

    // Muddati o'tgan sessiya — CREATED/REDIRECT_REQUIRED, hali ishlanmagan
    if (['CREATED', 'REDIRECT_REQUIRED'].includes(payment.status) && payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'EXPIRED' } });
        await auditLog(tx, { paymentId: payment.id, action: 'payment_expired' });
        const unpaid = await tx.payment.count({
          where: { bookingId: payment.bookingId, status: { in: [...PAID_STATUSES] } },
        });
        if (unpaid === 0) {
          await tx.booking.update({ where: { id: payment.bookingId }, data: { status: 'PENDING' } });
        }
      });
      return ok(res, { payment: await prisma.payment.findUnique({ where: { id: payment.id } }), bookingStatus: (await prisma.booking.findUnique({ where: { id: payment.bookingId }, select: { status: true } }))?.status });
    }

    // Providerdan jonli holat so'rash (throttle: 10 soniyada 1 marta)
    let verified = false;
    if (['REDIRECT_REQUIRED', 'PROCESSING', 'CREATED'].includes(payment.status) && isOnline) {
      const method = (payment.provider as string) || (payment.metadata as any)?.providerMethod;
      if (method && method !== 'CASH') {
        const now = Date.now();
        const last = lastVerifyAt.get(payment.id) || 0;
        if (now - last > 10_000) {
          lastVerifyAt.set(payment.id, now);
          try {
            const provider = getProvider(method.toLowerCase());
            const result = await provider.verifyPayment({
              paymentId: payment.id,
              providerTransactionId: payment.providerTransactionId,
              providerPaymentId: payment.providerPaymentId,
              amount: toNumber(payment.amount),
              currency: payment.currency,
              storedMetadata: payment.metadata as any,
            });
            if (result.status === 'PAID' && payment.providerPaymentId) {
              const txResult = await prisma.$transaction(async (tx) => {
                const r = await settleVerifiedPayment(tx, { id: payment.id, audit: { source: 'status_poll', provider: method } });
                return r;
              });
              verified = txResult.settled;
              void txResult;
            } else if (result.status === 'CANCELLED' && ['REDIRECT_REQUIRED', 'CREATED'].includes(payment.status)) {
              await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } });
            } else if (result.status === 'PROCESSING' && payment.status === 'CREATED') {
              await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PROCESSING' } });
            }
          } catch {
            // Provider mavjud emas yoki ishlamayapti — keyingi so'rovda qayta uriniladi
          }
        }
      }
    }

    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId }, select: { status: true, depositPercent: true } });

    return ok(res, {
      payment: fresh,
      verified,
      bookingStatus: booking?.status,
      depositPercent: booking?.depositPercent,
      status: fresh?.status,
    });
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/payments/webhook/:provider — PROVIDER: webhook (haqiqiy manba) ============
export const webhookPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const method = String(req.params.provider || '').toLowerCase();
    const provider = getProvider(method);

    // Provayder kredensiallari ulangan bo'lmasa — webhook'ni QAT'IY rad etamiz.
    // To'lovlar faqat ishonchli (imzo bilan tasdiqlangan) manbadan qabul qilinadi.
    if (!provider.isConfigured() || !isProviderAvailable(provider.id)) {
      return res.status(404).json({ error: 'not found' });
    }

    const ctx = {
      provider: provider.id,
      body: (req as any).body || {},
      rawBody: (req as any).rawBody,
      query: req.query as Record<string, string | undefined>,
      headers: req.headers as Record<string, string | string[] | undefined>,
      url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    };

    let result;
    try {
      result = await provider.handleWebhook(ctx);
    } catch {
      return res.status(400).json({ error: 'invalid webhook' });
    }

    if (!result || !result.acknowledged) {
      return res.status(400).json({ error: 'invalid webhook' });
    }

    const merchantTransactionId = result.providerTransactionId || result.providerPaymentId;
    if (merchantTransactionId) {
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { id: merchantTransactionId },
            { providerTransactionId: merchantTransactionId },
            { providerPaymentId: merchantTransactionId },
          ],
        },
        include: { booking: { include: { room: true } } },
      });

      if (payment) {
        // Provayder summasini talab qilamiz: summa kelmasa/webhook sertifikatsiz
        // bo'lsa, DB'dagi summaga tayanib "PAID" qilish mumkin emas.
        const webhookAmount = toNumber(result.amount);
        const amountOk =
          Number.isFinite(webhookAmount) &&
          Math.abs(round2(webhookAmount) - round2(toNumber(payment.amount))) <= 1;

        if (['PAID'].includes(result.status as string) && amountOk) {
          const txResult = await prisma.$transaction(async (tx) => {
            const r = await settleVerifiedPayment(tx, {
              id: payment.id,
              actorId: null,
              actorRole: `PROVIDER:${provider.id}`,
              audit: { source: 'webhook', action: result.action, webhookAmount: result.amount },
              providerTransactionId: result.providerTransactionId ?? null,
              providerPaymentId: result.providerPaymentId ?? null,
            });
            if (r.booking) {
              const info = bookingInfoOf(payment);
              io.emit('booking_status_changed', { roomId: info.roomId ?? payment.booking.roomId, bookingId: payment.bookingId, type: r.booking.status });
            }
            return r;
          });
          if (txResult.settled) {
            await auditLog(prisma as any as TxClient, {
              paymentId: payment.id,
              action: 'webhook_received',
              actorRole: `PROVIDER:${provider.id}`,
              metadata: { action: result.action, amount: result.amount },
            });
          }
        } else if (['PROCESSING'].includes(result.status as string) && !['PAID', 'COMPLETED'].includes(payment.status)) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'PROCESSING', providerTransactionId: result.providerTransactionId || payment.providerTransactionId || null, providerPaymentId: result.providerPaymentId || payment.providerPaymentId || null },
          });
        } else if (['CANCELLED'].includes(result.status as string) && !['PAID', 'COMPLETED'].includes(payment.status)) {
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED', failureReason: 'provayder tomonidan bekor qilindi' } });
            await auditLog(tx, { paymentId: payment.id, action: 'payment_failed', actorRole: `PROVIDER:${provider.id}`, metadata: { reason: 'cancelled', action: result.action } });
            const unpaid = await tx.payment.count({ where: { bookingId: payment.bookingId, status: { in: [...PAID_STATUSES] } } });
            if (unpaid === 0) {
              await tx.booking.update({ where: { id: payment.bookingId }, data: { status: 'PENDING' } });
            }
          });
        }
      }
    }

    if (result.response !== undefined) {
      return res.json(result.response);
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments/history — USER: o'z to'lovlari tarixi ============
export const getPaymentHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { userId: req.user!.userId },
        include: {
          booking: {
            select: { id: true, date: true, startTime: true, endTime: true, finalPrice: true, status: true, room: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.payment.count({ where: { userId: req.user!.userId } }),
    ]);

    return ok(res, { payments, total, limit, offset });
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments/:bookingId — USER: bron to'lov holati ============
export const getPaymentStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') return forbidden(res);

    const payments = await prisma.payment.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'desc' },
    });

    const finalPrice = round2(toNumber(booking.finalPrice));
    const totalPaid = paidAmount(payments);
    const remainingDue = round2(Math.max(0, finalPrice - totalPaid));
    const requiredDeposit = round2((finalPrice * booking.depositPercent) / 100);

    return ok(res, {
      bookingId: booking.id,
      bookingStatus: booking.status,
      depositPercent: booking.depositPercent,
      totalPrice: booking.finalPrice,
      advanceAmount: booking.advanceAmount,
      remainingAmount: booking.remainingAmount,
      requiredDeposit,
      totalPaid,
      remainingDue,
      isFullyPaid: remainingDue <= 0.004,
      payments,
    });
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/payments/:id/confirm — ADMIN: CASH to'lov tasdiqlash ============
export const confirmPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { booking: { include: { room: true } } },
    });
    if (!payment) return notFoundMsg(res, 'To\'lov topilmadi');

    if (payment.booking.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res);
    }
    if (!['PENDING', 'CREATED', 'REDIRECT_REQUIRED', 'PROCESSING'].includes(payment.status)) return badRequest(res, 'Bu to\'lov allaqachon yakunlangan');
    if (payment.method && payment.method !== 'CASH' && payment.method !== 'TRANSFER') {
      return badRequest(res, 'Onlayn to\'lovni admin emas, provereng va provayder orqali yakunlanadi');
    }

    const txResult = await prisma.$transaction(async (tx) => {
      await auditLog(tx, { paymentId: payment.id, action: 'admin_marked_paid', actorId: req.user!.userId, actorRole: req.user!.role as string });
      await tx.paymentEvidence.updateMany({
        where: { paymentId: payment.id, status: 'SUBMITTED' },
        data: { status: 'APPROVED', reviewedById: req.user!.userId, reviewedAt: new Date() },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { settledAt: new Date(), settledById: req.user!.userId },
      });
      const r = await settleVerifiedPayment(tx, { id: payment.id, actorId: req.user!.userId, actorRole: req.user!.role as string, audit: { source: 'admin_cash_confirm' } });
      if (r.booking) {
        const info = bookingInfoOf(payment);
        io.emit('booking_status_changed', { roomId: info.roomId ?? payment.booking.roomId, bookingId: payment.bookingId, type: r.booking.status });
      }
      return r;
    });

    await prisma.notification.create({
      data: {
        userId: payment.userId,
        title: "To'lovingiz tasdiqlandi",
        message: `${toNumber(payment.amount).toLocaleString('ru-RU')} so'm to'lov tasdiqlandi. Endi bronni boshlashingiz mumkin.`,
        type: 'payment',
      },
    }).catch(() => undefined);
    io.to(`user:${payment.userId}`).emit('notification_new', { userId: payment.userId, type: 'payment' });

    return ok(res, txResult.paid, 'To\'lov tasdiqlandi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments — SUPER_ADMIN: barcha to'lovlar ============
export const getAllPayments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limit, offset, status, q, receiptNumber: receiptQuery } = req.query as {
      limit?: string;
      offset?: string;
      status?: string;
      /** Umumiy qidiruv: chek raqami, ism yoki email. */
      q?: string;
      /** Aniq chek raqami — bankda tekshirishda tez topish uchun. */
      receiptNumber?: string;
    };
    const where: any = {};
    if (status) where.status = status.toUpperCase();

    // Chek raqami — aniq qidirish. Mijoz raqamni telefon orqali aytadi;
    // `contains` bilan kiritilgan bo'shliq/kichik-harf farqini kechiradi.
    const receipt = (receiptQuery || '').trim().toUpperCase();
    if (receipt) where.receiptNumber = { contains: receipt };

    const term = (q || '').trim();
    if (term) {
      where.OR = [
        { receiptNumber: { contains: term.toUpperCase() } },
        { user: { fullName: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [payments, total, revenue] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          booking: { select: { id: true, finalPrice: true, status: true, room: { select: { name: true } } } },
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit) || 50,
        skip: Number(offset) || 0,
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where: { status: { in: [...PAID_STATUSES] } },
        _sum: { amount: true },
      }),
    ]);

    return ok(res, { payments, total, revenue: round2(toNumber(revenue._sum.amount || 0)) });
  } catch (err) {
    next(err);
  }
};
// ============================================================================
// QO'LDA O'TKAZMA (TRANSFER) OQIMI — karta orqali to'lov
// ============================================================================

/**
 * GET /api/payments/merchant-card — Dogaon kartasi (foydalanuvchi nusxalaydi).
 *
 * AUTENTIFIKATSIYA MAJBURIY: karta raqami ommaviy ro'yxatga tushmasin
 * (skraper/bo'g'in). Faqat tizimga kiritgan foydalanuvchi ko'radi.
 */
export const getMerchantCard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // `?method=UZUM` — har bir to'lov usuli uchun alohida karta. Berilmasa
    // `DEFAULT` (yoki eski umumiy karta) qaytariladi.
    const method = typeof req.query?.method === 'string' ? req.query.method : '';
    const card = await resolveMerchantCard(method);
    if (!card) {
      return ok(res, { configured: false, card: null, method: method.toUpperCase() || null }, 'To\'lov kartasi hali sozlanmagan');
    }
    return ok(res, { configured: true, card, method: method.toUpperCase() || null });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/payments/merchant-cards — BARCHA sozlangan dogaon kartalar.
 *
 * Chekout sahifasi to'lov usullari ro'yxatini shu ma'lumot asosida quradi:
 * har bir usul (UZUM, PAYME, CLICK, PAYNET...) uchun karta sozlangan bo'lsa
 * usul tanlanadi va karta DARHOL ko'rsatiladi (to'lov yaratilishini kutmay).
 *
 * AUTENTIFIKATSIYA MAJBURIY — karta raqamlari ommaviy chiqmaydi.
 */
export const getMerchantCards = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cards = await listConfiguredCards();
    return ok(res, { cards });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/:id/proof — To'lovchi o'tkazma tasdig'ini yuboradi.
 *
 * Qabul qilinadi:
 *   cardLast4  — karta raqamining OXIRGI 4 raqami (masalan "4321")
 *   cardholderName — egasi ism-familiyasi
 *   receipts   — 1..3 ta chek (galereyadan JPG/PNG/WEBP/PDF)
 *
 * XAVFSIZLIK:
 *   * To'liq karta raqami (PAN) qabul qilinMAYDI va saqlanMAYDI — faqat
 *     oxirgi 4 raqam. To'lovchi karta raqamining to'liqini ham yubormasligi
 *     kerak (shu sabab maydon 4 raqam bilan cheklangan).
 *   * Faqat to'lovning EGASI (booking.userId) yubora oladi.
 *   * Faqat hali tasdiqlanmagan (PENDING/CREATED) to'lovga.
 *   * Har bir yuklash auditga yoziladi.
 */
export const submitTransferProof = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { booking: { include: { room: { select: { ownerId: true } } } } },
    });
    if (!payment) return notFoundMsg(res, 'To\'lov topilmadi');

    // faqat to'lov egasi
    if (payment.userId !== req.user!.userId) return forbidden(res, 'Bu to\'lovga kirish huquqingiz yo\'q');

    if (!['PENDING', 'CREATED'].includes(payment.status)) {
      return badRequest(res, 'Bu to\'lov allaqachon tasdiqlangan yoki bekor qilingan');
    }
    const manualTransfer = (payment.metadata as any)?.manualTransfer === true;
    if (!manualTransfer && payment.method !== 'TRANSFER') {
      return badRequest(res, 'Bu to\'lov uchun o\'tkazma tasdig\'i talab qilinmaydi');
    }

    const last4 = String(req.body?.cardLast4 ?? '').replace(/\D/g, '');
    const holder = String(req.body?.cardholderName ?? '').trim().replace(/\s+/g, ' ');

    if (!/^\d{4}$/.test(last4)) {
      return badRequest(res, 'Karta raqamining oxirgi 4 ta raqamini kiriting (masalan: 4321)');
    }
    if (holder.length < 3 || holder.length > 120) {
      return badRequest(res, 'Karta egasining ism-familiyasini to\'liq kiriting');
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length < 1) {
      return badRequest(res, 'Kamida 1 ta o\'tkazma cheki (screenshot) yuklang');
    }
    if (files.length > 3) {
      return badRequest(res, 'Ko\'pi bilan 3 ta chek yuklash mumkin');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // eski (rad etilgan) cheklarni arxivlaymiz — o'tkazib yuborilmaydi
      await tx.paymentEvidence.updateMany({
        where: { paymentId: payment.id, status: 'SUBMITTED' },
        data: { status: 'REJECTED', reviewNote: 'Yangi tasdiq bilan almashtirildi' },
      });

      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        await tx.paymentEvidence.create({
          data: {
            paymentId: payment.id,
            bookingId: payment.bookingId,
            uploadedById: req.user!.userId,
            fileUrl: `/uploads/evidence/${f.filename}`,
            fileName: f.originalname?.slice(0, 200) || `chek-${i + 1}`,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            status: 'SUBMITTED',
          },
        });
      }

      await auditLog(tx, {
        paymentId: payment.id,
        action: 'transfer_proof_submitted',
        actorId: req.user!.userId,
        actorRole: req.user!.role as string,
        metadata: { cardLast4: last4, cardholderName: holder, receipts: files.length },
      });

      // To'lov o'zi PAID bo'lmaydi — admin bank hisobida tekshiradi va tasdiqlaydi.
      return tx.payment.update({
        where: { id: payment.id },
        data: {
          method: 'TRANSFER',
          provider: null,
          status: 'PENDING',
          proofCardLast4: last4,
          proofCardholderName: holder,
          proofSubmittedAt: new Date(),
        },
        include: { evidences: true },
      });
    });

    const info = bookingInfoOf(payment);
    io.emit('payment_proof_submitted', {
      roomId: info.roomId ?? payment.booking.roomId,
      bookingId: payment.bookingId,
      paymentId: updated.id,
    });

    return ok(res, {
      paymentId: updated.id,
      cardLast4: last4,
      receipts: updated.evidences.length,
      status: updated.status,
    }, 'Tasdiq yuborildi — admin bank hisobini tekshirib tasdiqlaydi');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/payments/debts — Kassa: qarzlar (overtime) + kutilayotgan
 * qo'lda to'lovlar (naqd / o'tkazma cheki).
 *   USER  — faqat o'z qarzlari
 *   ADMIN/SUPER_ADMIN — xona (ADMIN) yoki barchasi (SUPER_ADMIN)
 * To'lanmagan (PAID/REFUNDED emas) qarzlar `open=true` bilan.
 *
 * MUHIM: `pending` — mijoz naqd yoki o'tkazma qilib, admin tasdig'i kutayotgan
 * to'lovlar. Ilgari ular faqat bildirishnoma orqali ko'rinardi va "kutilmoqda"
 * da qolib ketardi; endi kassada ro'yxatda turadi va bir bosishda tasdiqlanadi.
 */
export const getDebts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { open } = req.query as { open?: string };
    const onlyOpen = open === undefined ? true : ['1', 'true', 'yes'].includes(open.toLowerCase());
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
    const scope: Prisma.PaymentWhereInput =
      req.user!.role === 'SUPER_ADMIN'
        ? {}
        : isAdmin
          ? { booking: { room: { ownerId: req.user!.userId } } }
          : { userId: req.user!.userId };

    const where: Prisma.PaymentWhereInput = {
      isDebt: true,
      ...(onlyOpen ? { status: { in: ['PENDING', 'CREATED', 'PROCESSING'] } } : {}),
      ...scope,
    };

    const [debts, pending] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: [{ settledAt: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 200,
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true } },
          booking: { select: { id: true, date: true, startTime: true, endTime: true, roomId: true, room: { select: { name: true } }, zone: { select: { name: true } } } },
          settledBy: { select: { id: true, fullName: true } },
        },
      }),
      // Kutilayotgan qo'lda to'lovlar — naqd (CASH) va o'tkazma (TRANSFER).
      // Faqat admin uchun: foydalanuvchining o'z "kutilmoqda" to'lovi bor.
      isAdmin
        ? prisma.payment.findMany({
            where: {
              ...scope,
              isDebt: false,
              method: { in: ['CASH', 'TRANSFER'] },
              status: { in: ['PENDING', 'CREATED', 'PROCESSING'] },
            },
            orderBy: { createdAt: 'asc' },
            take: 100,
            include: {
              user: { select: { id: true, fullName: true, phone: true, email: true } },
              booking: { select: { id: true, date: true, startTime: true, endTime: true, roomId: true, room: { select: { name: true } }, zone: { select: { name: true } } } },
              evidences: { where: { status: 'SUBMITTED' }, orderBy: { createdAt: 'asc' } },
            },
          })
        : Promise.resolve([]),
    ]);

    return ok(res, {
      openCount: debts.length,
      total: round2(debts.reduce((s, d) => s + toNumber(d.amount), 0)),
      pendingCount: pending.length,
      pendingTotal: round2(pending.reduce((s, d) => s + toNumber(d.amount), 0)),
      debts: debts.map((d) => ({
        id: d.id,
        amount: toNumber(d.amount),
        dueAt: d.dueAt,
        createdAt: d.createdAt,
        status: d.status,
        settledAt: d.settledAt,
        settledBy: d.settledBy?.fullName || null,
        bookingId: d.bookingId,
        bookingLabel: `${d.booking.room?.name || 'Xona'}${d.booking.zone?.name ? ` / ${d.booking.zone.name}` : ''} (${d.booking.startTime}-${d.booking.endTime})`,
        user: { id: d.user.id, fullName: d.user.fullName, phone: d.user.phone, email: d.user.email },
      })),
      pending: pending.map((d) => ({
        id: d.id,
        amount: toNumber(d.amount),
        method: d.method,
        status: d.status,
        createdAt: d.createdAt,
        proofSubmittedAt: d.proofSubmittedAt,
        cardLast4: d.proofCardLast4,
        cardholderName: d.proofCardholderName,
        receipts: d.evidences.map((e) => ({ id: e.id, url: e.fileUrl, mimeType: e.mimeType })),
        bookingId: d.bookingId,
        bookingLabel: `${d.booking.room?.name || 'Xona'}${d.booking.zone?.name ? ` / ${d.booking.zone.name}` : ''} (${d.booking.startTime}-${d.booking.endTime})`,
        user: { id: d.user.id, fullName: d.user.fullName, phone: d.user.phone, email: d.user.email },
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/:id/settle — ADMIN: kassada to'landi deb tasdiqlash.
 *
 * Ikki holatni yopadi:
 *   1) QARZ (isDebt=true) — sessiya tugagandan keyin yuzaga kelgan overtime
 *      qarz: mijoz naqd pulni kassaga beradi, admin shu yerda tasdiqlaydi.
 *   2) KUTILAYOTGAN QO'LDA TO'LOV (CASH / TRANSFER, isDebt=false) — mijoz
 *      to'lov yaratgan, naqd kassaga kelgan yoki o'tkazma chekini yuborgan.
 *      Bunday to'lov oldin faqat bildirishnoma orqali ko'rinardi va
 *      "kutilmoqda" da qolib ketardi — endi kassada ro'yxatda turadi va
 *      shu tugma orqali bir bosishda tasdiqlanadi.
 *
 * To'lov PAID ga o'tadi, `settledAt`/`settledBy` yoziladi (kim tasdiqlagan),
 * cheklar APPROVED bo'ladi va MIJOZGA bildirishnoma boribadi.
 */
export const settleDebt = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { booking: { include: { room: { select: { ownerId: true } } } }, user: { select: { fullName: true } } },
    });
    if (!payment) return notFoundMsg(res, 'To\'lov topilmadi');
    if (payment.booking.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res);
    }

    const isManualPending =
      !payment.isDebt &&
      (payment.method === 'CASH' || payment.method === 'TRANSFER') &&
      ['PENDING', 'CREATED', 'PROCESSING'].includes(payment.status);

    if (!payment.isDebt && !isManualPending) {
      return badRequest(res, payment.isDebt ? 'Bu qarz emas' : 'Bu to\'lov allaqachon yakunlangan yoki tasdiqlashga loyiq emas');
    }
    if (payment.isDebt && payment.settledAt) {
      return badRequest(res, 'Bu qarz allaqachon kassada to\'langan deb tasdiqlangan');
    }

    const result = await prisma.$transaction(async (tx) => {
      await auditLog(tx, {
        paymentId: payment.id,
        action: isManualPending ? 'manual_payment_settled' : 'debt_settled_cash',
        actorId: req.user!.userId,
        actorRole: req.user!.role as string,
        metadata: {
          amount: toNumber(payment.amount),
          user: payment.user.fullName,
          method: payment.method,
          isDebt: payment.isDebt,
        },
      });
      const r = await settleVerifiedPayment(tx, {
        id: payment.id,
        actorId: req.user!.userId,
        actorRole: req.user!.role as string,
        audit: { source: 'till_cash_settlement' },
      });
      // Cheklar tasdiqlandi deb belgilandi (TRANSFER holati uchun)
      await tx.paymentEvidence.updateMany({
        where: { paymentId: payment.id, status: 'SUBMITTED' },
        data: { status: 'APPROVED', reviewedById: req.user!.userId, reviewedAt: new Date() },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          settledAt: new Date(),
          settledById: req.user!.userId,
          // Naqd to'lov kassada yopilgan bo'lsa — CASH deb qoladi; o'tkazma
          // o'z usulini saqlaydi (bank orqali kelgan edi).
          ...(payment.method === 'CASH' ? { method: 'CASH' as const } : {}),
        },
      });
      return r;
    });

    // Mijoz darhol xabar oladi — "tasdiqlash kelmayapti" muammosi shu yerda
    // hal bo'ladi (ikkala tomon ham xabardor bo'ladi).
    await prisma.notification.create({
      data: {
        userId: payment.userId,
        title: "To'lovingiz tasdiqlandi",
        message: `${toNumber(payment.amount).toLocaleString('ru-RU')} so'm to'lov kassada qabul qilindi. Endi bronni boshlashingiz mumkin.`,
        type: 'payment',
      },
    }).catch(() => undefined);
    io.to(`user:${payment.userId}`).emit('notification_new', { userId: payment.userId, type: 'payment' });
    io.emit('booking_status_changed', {
      roomId: payment.booking.roomId,
      bookingId: payment.bookingId,
      type: result.booking?.status || 'PAID',
    });

    return ok(res, result.paid, 'Kassada to\'langan deb tasdiqlandi');
  } catch (err) {
    next(err);
  }
};
