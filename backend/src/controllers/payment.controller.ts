import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';
import { toNumber, round2, isValidAmount } from '../utils/money';
import { io } from '../lib/socket';
import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

// ============ YORDAMCHILAR ============

function paidAmount(payments: Array<{ amount: any; status: string }>, status: string): number {
  let sum = 0;
  for (const p of payments) {
    if (p.status === status) sum = round2(sum + round2(toNumber(p.amount)));
  }
  return round2(sum);
}

/**
 * Bonus ball berish — har bir muvaffaqiyatli to'lovdan so'ng (1% ball = so'm).
 * Bron yaratishda sarflangan ballar avtomatik qaytarilmaydi (REFUND faqat bekor qilishda).
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

/**
 * To'lovni COMPLETED qiladi va qancha to'langaniga qarab bronni CONFIRMED ga olib keladi.
 * Qoida: bron faqat 30% avans to'liq to'langandagina tasdiqlanadi.
 */
async function settlePayment(tx: TxClient, id: string) {
  const paid = await tx.payment.update({
    where: { id },
    data: { status: 'COMPLETED', paidAt: new Date() },
  });

  const payments = await tx.payment.findMany({
    where: { bookingId: paid.bookingId, status: 'COMPLETED' },
    select: { amount: true, status: true },
  });
  const totalPaid = paidAmount(payments, 'COMPLETED');

  const booking = await tx.booking.findUnique({
    where: { id: paid.bookingId },
    select: { advanceAmount: true, finalPrice: true, status: true, roomId: true, id: true, userId: true },
  });
  if (!booking) return { paid, booking: null, totalPaid };

  const advance = round2(toNumber(booking.advanceAmount));
  const shouldConfirm = booking.status === 'PENDING' && totalPaid >= advance - 0.004;

  const updatedBooking = shouldConfirm
    ? await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED' },
        include: { room: { select: { id: true, ownerId: true } } },
      })
    : null;

  // To'lov muvaffaqiyatli — bonus ballari to'lanadi
  await awardPoints(tx, {
    userId: booking.userId,
    bookingId: booking.id,
    amount: toNumber(paid.amount),
  });

  return { paid, booking: updatedBooking, totalPaid };
}

// ============ POST /api/payments/create — USER: to'lov yaratish ============
export const createPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId, amount, method } = req.body;
    const amt = round2(toNumber(amount));

    if (!bookingId || method === undefined) return badRequest(res, 'bookingId va method majburiy');
    if (!isValidAmount(amt)) return badRequest(res, 'To\'lov miqdori noto\'g\'ri');

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { room: true, payments: true },
    });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res, 'Bu bron sizniki emas');
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      return badRequest(res, 'Bu bron uchun to\'lov mumkin emas');
    }

    const finalPrice = round2(toNumber(booking.finalPrice));
    const advanceAmount = round2(toNumber(booking.advanceAmount));
    const totalPaid = paidAmount(booking.payments, 'COMPLETED');
    const remainingDue = round2(finalPrice - totalPaid);

    // Ortiqcha to'lovni qat'iy rad etamiz (0.01 tiyinga tolerance bilan)
    if (remainingDue <= 0.004) return badRequest(res, 'Bron to\'liq to\'langan');
    if (amt > remainingDue + 0.004) return badRequest(res, `To\'lov miqdori qoldiqdan oshmaydi. Qoldiq: ${remainingDue} so'm`);

    const advancePaid = paidAmount(booking.payments.filter((p) => p.type === 'ADVANCE'), 'COMPLETED');
    const advanceOwed = round2(advanceAmount - advancePaid);
    const after = round2(totalPaid + amt);

    // Tipani aniqlash: oxirgi qoldiq to'lovi => REMAINING, avans yetarli => ADVANCE
    const isAdvance = after < finalPrice - 0.004 && amt <= advanceOwed + 0.004;

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        userId: req.user!.userId,
        amount: amt,
        type: isAdvance ? 'ADVANCE' : 'REMAINING',
        method,
        status: 'PENDING',
      },
    });

    // CASH to'lov — admin kassada qabul qiladi (xabarnoma yuboramiz)
    if (method === 'CASH') {
      await prisma.notification.create({
        data: {
          userId: booking.room.ownerId,
          title: 'Yangi kassa to\'lovi kutilmoqda',
          message: `${amt.toLocaleString('ru-RU')} so'm ${isAdvance ? 'avans' : 'qoldiq'} to'lov kassada. Tasdiqlash kerak.`,
          type: 'payment',
        },
      });
      io.emit('notification_new', { userId: booking.room.ownerId, type: 'payment' });
      io.to(`user:${booking.room.ownerId}`).emit('notification_new', { userId: booking.room.ownerId, type: 'payment' });
    }

    return created(res, payment, 'To\'lov yaratildi');
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/payments/:id/pay — USER: onlayn to'lov (PSP simulyatsiya) ============
export const payOnline = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { cardNumber, cardHolder } = req.body || {};

    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { booking: { include: { room: true } } },
    });
    if (!payment) return notFoundMsg(res, 'To\'lov topilmadi');
    if (payment.userId !== req.user!.userId) return forbidden(res, 'Bu to\'lov sizniki emas');
    if (payment.status !== 'PENDING') return badRequest(res, 'Bu to\'lov allaqachon yakunlangan');

    const onlineMethods = ['PAYME', 'CLICK', 'UZCARD', 'HUMO', 'UZUM'];
    const method = payment.method as string;
    if (!method || !onlineMethods.includes(method)) {
      return badRequest(res, 'Kassa to\'lovi faqat admin tomonidan tasdiqlanadi');
    }

    // Karta validatsiyasi (simulyatsiya)
    const digits = (cardNumber || '').replace(/\s/g, '');
    if (digits && !/^\d+$/.test(digits)) {
      return badRequest(res, 'Karta raqami noto\'g\'ri');
    }
    void cardHolder;

    const transactionId = `TXN-${method}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const updated = await prisma.$transaction(async (tx) => {
      // transactionId'ni avval yozamiz, so'ng hisobni qayta hisoblash
      await tx.payment.update({
        where: { id: payment.id },
        data: { transactionId },
      });
      const res = await settlePayment(tx, payment.id);
      if (res.booking) {
        io.emit('booking_status_changed', {
          roomId: payment.booking.roomId,
          bookingId: payment.bookingId,
          type: 'CONFIRMED',
        });
      }
      return res;
    });

    return ok(res, updated, 'To\'lov muvaffaqiyatli yakunlandi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments/:bookingId — USER: to'lov holati ============
export const getPaymentStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res);

    const payments = await prisma.payment.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'desc' },
    });

    const finalPrice = round2(toNumber(booking.finalPrice));
    const totalPaid = paidAmount(payments, 'COMPLETED');
    const advancePaid = paidAmount(payments.filter((p) => p.type === 'ADVANCE'), 'COMPLETED');
    const remainingPaid = paidAmount(payments.filter((p) => p.type === 'REMAINING'), 'COMPLETED');
    const remainingDue = round2(Math.max(0, finalPrice - totalPaid));

    return ok(res, {
      bookingId: booking.id,
      bookingStatus: booking.status,
      totalPrice: booking.finalPrice,
      advanceAmount: booking.advanceAmount,
      remainingAmount: booking.remainingAmount,
      advancePaid,
      remainingPaid,
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
    if (payment.status !== 'PENDING') return badRequest(res, 'Bu to\'lov allaqachon yakunlangan');
    if (payment.method && payment.method !== 'CASH') {
      return badRequest(res, 'Onlayn to\'lovni admin emas, foydalanuvchi yakunlaydi');
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const result = await settlePayment(tx, payment.id);
      if (result.booking) {
        io.emit('booking_status_changed', {
          roomId: payment.booking.roomId,
          bookingId: payment.bookingId,
          type: 'CONFIRMED',
        });
      }
      return result;
    });

    return ok(res, txResult.paid, 'To\'lov tasdiqlandi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/payments — SUPER_ADMIN: barcha to'lovlar ============
export const getAllPayments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limit, offset, status } = req.query as { limit?: string; offset?: string; status?: string };
    const where: any = {};
    if (status) where.status = status.toUpperCase();

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
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return ok(res, { payments, total, revenue: round2(toNumber(revenue._sum.amount || 0)) });
  } catch (err) {
    next(err);
  }
};