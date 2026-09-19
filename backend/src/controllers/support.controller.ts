import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { io } from '../lib/socket';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';

const SUPPORT_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, role: true } },
  sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
};

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/**
 * POST /api/support/messages — xabar yuborish (foydalanuvchi/admin ↔ super_admin)
 * - USER/ADMIN o'z thread'iga yozadi (super_admin'ga murojaat)
 * - SUPER_ADMIN/ADMIN body.userId orqali berilgan thread'ga javob yozadi
 */
export const sendSupport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { message, userId } = req.body;
    const text = String(message || '').trim();
    if (!text) return badRequest(res, 'Xabar yozing');
    if (text.length > 1000) return badRequest(res, 'Xabar 1000 ta belgidan oshmasligi kerak');

    const me = req.user!;
    const isStaff = STAFF_ROLES.includes(me.role);
    let threadUserId = me.userId;

    if (isStaff) {
      if (!userId) return badRequest(res, 'Javob yozish uchun userId kerak');
      const target = await prisma.user.findUnique({ where: { id: String(userId) } });
      if (!target) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
      threadUserId = target.id;
    } else {
      // Foydalanuvchi o'z murojaati — super_admin'ga
      threadUserId = me.userId;
    }

    const msg = await prisma.supportMessage.create({
      data: {
        userId: threadUserId,
        senderId: me.userId,
        message: text.slice(0, 1000),
      },
      include: SUPPORT_INCLUDE,
    });

    // Jonli yetkazish: thread egasiga + super adminlar zaliga
    io.to(`user:${threadUserId}`).emit('support:new', { userId: threadUserId, message: msg });
    io.to(`support:${threadUserId}`).emit('support:thread:new', { userId: threadUserId, message: msg });
    io.to('support:sadmin').emit('support:new', { userId: threadUserId, message: msg });

    return created(res, msg);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/support/messages?userId= — thread tarixi
 * - USER/ADMIN: o'z murojaati
 * - SUPER_ADMIN: userId berilsa o'sha foydalanuvchi thread'i
 */
export const getSupportMessages = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const me = req.user!;
    const isStaff = STAFF_ROLES.includes(me.role);
    const { userId } = req.query as { userId?: string };

    let threadUserId = me.userId;
    if (isStaff && userId) {
      threadUserId = String(userId);
      const target = await prisma.user.findUnique({ where: { id: threadUserId } });
      if (!target) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
    }

    const messages = await prisma.supportMessage.findMany({
      where: { userId: threadUserId },
      include: SUPPORT_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    // O'qilgan deb belgilash — boshqa taraf (recipient) ko'rganlarini
    await prisma.supportMessage.updateMany({
      where: { userId: threadUserId, isRead: false, senderId: { not: me.userId } },
      data: { isRead: true },
    });

    return ok(res, { messages, userId: threadUserId });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/support/threads — SUPER_ADMIN: barcha murojaatlar (unread bilan)
 */
export const getSupportThreads = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!STAFF_ROLES.includes(req.user!.role)) return forbidden(res, 'Faqat super_admin/admin uchun');

    const msgs = await prisma.supportMessage.findMany({
      include: { user: { select: { id: true, fullName: true, email: true, phone: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const byUser = new Map<string, any>();
    for (const m of msgs) {
      const cur = byUser.get(m.userId) || { user: m.user, unread: 0, lastMessage: null, total: 0 };
      // super_admin uchun o'qilmaganlar = thread egasining o'qilmagan xabarlari
      if (m.senderId === m.userId && !m.isRead) cur.unread += 1;
      cur.total += 1;
      if (!cur.lastMessage) cur.lastMessage = m;
      byUser.set(m.userId, cur);
    }

    const threads = Array.from(byUser.values())
      .sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));

    return ok(res, threads);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/support/threads/:userId — SUPER_ADMIN: murojaatni tozalash
 */
export const clearSupportThread = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!STAFF_ROLES.includes(req.user!.role)) return forbidden(res, 'Faqat super_admin/admin uchun');
    await prisma.supportMessage.deleteMany({ where: { userId: req.params.userId } });
    return ok(res, null, 'Murojaat tozalandi');
  } catch (err) {
    next(err);
  }
};