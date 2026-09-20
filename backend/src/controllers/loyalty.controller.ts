import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok } from '../utils/response';

// ============ GET /api/loyalty/me — USER: balans va tarix ============
export const getMyLoyalty = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const me = req.user!;

    const user = await prisma.user.findUnique({
      where: { id: me.userId },
      select: { loyaltyBalance: true },
    });

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { userId: me.userId },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return ok(res, {
      balance: user?.loyaltyBalance || 0,
      transactions,
      totalEarned: transactions
        .filter((t) => t.type === 'EARN')
        .reduce((s, t) => s + t.amount, 0),
      totalSpent: Math.abs(
        transactions
          .filter((t) => t.type === 'REDEEM')
          .reduce((s, t) => s + t.amount, 0)
      ),
    });
  } catch (err) {
    next(err);
  }
};