import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';

// ============ POST /api/payments/create — USER: to'lov yaratish ============
// Hozircha CASH va mark manually confirmed. Payme/Click integratsiyasi keyinroq.
export const createPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId, amount, method } = req.body;

    if (!bookingId || !amount) {
      return badRequest(res, 'bookingId va amount majburiy');
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return notFoundMsg(res, 'Bron topilmadi');
    if (booking.userId !== req.user!.userId) return forbidden(res, 'Bu bron sizniki emas');
    if (booking.status === 'CANCELLED') return badRequest(res, 'Bekor qilingan bron uchun to\'lov mumkin emas');

    // Advance qancha to'langanligini hisoblaymiz
    const paidAdvance = await prisma.payment.aggregate({
      where: { bookingId, type: 'ADVANCE', status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const advanceOwed = Number(booking.advanceAmount.toString()) - (Number(paidAdvance._sum.amount || 0));
    const isAdvance = Number(amount) <= advanceOwed;

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        userId: req.user!.userId,
        amount,
        type: isAdvance ? 'ADVANCE' : 'REMAINING',
        method: method || null,
        status: 'PENDING',
      },
    });

    return created(res, payment, 'To\'lov yaratildi');
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

    const totalPaid = payments.filter((p) => p.status === 'COMPLETED').reduce((sum, p) => sum + Number(p.amount.toString()), 0);

    return ok(res, {
      bookingId: booking.id,
      totalPrice: booking.finalPrice,
      advanceAmount: booking.advanceAmount,
      advancePaid: payments.filter((p) => p.type === 'ADVANCE' && p.status === 'COMPLETED').reduce((s, p) => s + Number(p.amount.toString()), 0),
      remainingAmount: booking.remainingAmount,
      remainingPaid: payments.filter((p) => p.type === 'REMAINING' && p.status === 'COMPLETED').reduce((s, p) => s + Number(p.amount.toString()), 0),
      totalPaid,
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
    if (payment.status === 'COMPLETED') return badRequest(res, 'To\'lov allaqachon tasdiqlangan');

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
      },
    });

    // Advance to'lov to'langanda bronni CONFIRMED qilamiz
    if (payment.type === 'ADVANCE') {
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: 'CONFIRMED' },
      });
    }

    return ok(res, updated, 'To\'lov tasdiqlandi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/admin/payments — SUPER_ADMIN: barcha to'lovlar ============
export const getAllPayments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const payments = await prisma.payment.findMany({
      include: {
        booking: { select: { id: true, finalPrice: true, status: true, room: { select: { name: true } } } },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit) || 50,
      skip: Number(offset) || 0,
    });
    return ok(res, payments);
  } catch (err) {
    next(err);
  }
};