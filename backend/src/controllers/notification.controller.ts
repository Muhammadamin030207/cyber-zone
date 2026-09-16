import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, notFoundMsg } from '../utils/response';

// ============ GET /api/notifications — USER: o'z xabarnomalari ============
export const getMyNotifications = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ok(res, notifications);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/notifications/unread-count — xabarnoma soni ============
export const getUnreadCount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.userId, isRead: false },
    });
    return ok(res, { count });
  } catch (err) {
    next(err);
  }
};

// ============ PUT /api/notifications/:id/read — o'qilgan deb belgilash ============
export const markRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification) return notFoundMsg(res, 'Xabarnoma topilmadi');
    if (notification.userId !== req.user!.userId) return notFoundMsg(res, 'Xabarnoma topilmadi');

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true },
    });
    return ok(res, updated);
  } catch (err) {
    next(err);
  }
};

// ============ PUT /api/notifications/read-all — hammasini o'qish ============
export const markAllRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    return ok(res, { updated: true });
  } catch (err) {
    next(err);
  }
};