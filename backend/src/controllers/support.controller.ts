import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { io } from '../lib/socket';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';

const SUPPORT_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, role: true } },
  sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
};

const isSuperAdmin = (role: string) => role === 'SUPER_ADMIN';
const isAdmin = (role: string) => role === 'ADMIN';

type Channel = 'ADMIN' | 'SUPER_ADMIN';

/**
 * POST /api/support/messages — xabar yuborish
 * - USER → super_admin (recipient=SUPER_ADMIN, default): o'z thread'i
 * - USER → admin (recipient=ADMIN, roomId kerak): xona adminiga shaxsiy xabar
 * - ADMIN → super_admin (recipient=SUPER_ADMIN, userId'siz): o'z murojaati
 * - ADMIN → javob (recipient=ADMIN, userId=thread egasi): o'z xonasi murojaatlariga
 * - SUPER_ADMIN → javob (userId kerak)
 */
export const sendSupport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { message, recipient, userId, roomId } = req.body;
    const text = String(message || '').trim();
    if (!text) return badRequest(res, 'Xabar yozing');
    if (text.length > 3000) return badRequest(res, 'Xabar 3000 ta belgidan oshmasligi kerak');

    const me = req.user!;
    const channel: Channel = recipient === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN';

    let threadUserId = me.userId;
    let targetRoomId: string | null = channel === 'ADMIN' ? String(roomId || '') || null : null;

    if (me.role === 'USER') {
      threadUserId = me.userId;
      if (channel === 'ADMIN') {
        if (!targetRoomId) return badRequest(res, "Admin'ga yozish uchun xona (roomId) kerak");
        const room = await prisma.computerRoom.findUnique({ where: { id: targetRoomId } });
        if (!room) return notFoundMsg(res, 'Xona topilmadi');
      }
    } else if (me.role === 'ADMIN') {
      if (userId && channel === 'ADMIN') {
        // Javob — o'z xonasi murojaatiga
        const target = await prisma.user.findUnique({ where: { id: String(userId) } });
        if (!target) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
        const myRoom = await prisma.computerRoom.findUnique({ where: { ownerId: me.userId } });
        if (!myRoom) return forbidden(res, 'Sizda xona biriktirilmagan');
        threadUserId = target.id;
        targetRoomId = myRoom.id;
      } else {
        // Admin super_admin'ga yozadi (o'z murojaati)
        threadUserId = me.userId;
        targetRoomId = null;
      }
    } else {
      // SUPER_ADMIN javob
      if (!userId) return badRequest(res, 'Javob yozish uchun userId kerak');
      const target = await prisma.user.findUnique({ where: { id: String(userId) } });
      if (!target) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
      threadUserId = target.id;
      if (channel === 'ADMIN' && !targetRoomId) return badRequest(res, 'ADMIN kanali uchun roomId kerak');
      if (channel === 'SUPER_ADMIN') targetRoomId = null;
    }

    const msg = await prisma.supportMessage.create({
      data: {
        userId: threadUserId,
        senderId: me.userId,
        message: text.slice(0, 3000),
        recipientRole: channel,
        roomId: targetRoomId,
      },
      include: SUPPORT_INCLUDE,
    });

    // Jonli yetkazish
    io.to(`user:${threadUserId}`).emit('support:new', { userId: threadUserId, message: msg });
    io.to(`support:${channel}:${threadUserId}`).emit('support:thread:new', { userId: threadUserId, message: msg });

    if (channel === 'ADMIN' && targetRoomId) {
      const room = await prisma.computerRoom.findUnique({ where: { id: targetRoomId } });
      if (room && room.ownerId !== me.userId) {
        io.to(`user:${room.ownerId}`).emit('support:new', { userId: threadUserId, message: msg });
        if (me.role === 'USER') {
          await prisma.notification
            .create({
              data: {
                userId: room.ownerId,
                title: 'Yangi murojaat',
                message: `${msg.user.fullName}: ${text.slice(0, 60)}`,
                type: 'support',
              },
            })
            .catch(() => { /* muhim emas */ });
        }
      }
    } else {
      io.to('support:sadmin').emit('support:new', { userId: threadUserId, message: msg });
    }

    return created(res, msg);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/support/messages — thread tarixi
 * Query: userId?, roomId?, recipient? ('ADMIN' | 'SUPER_ADMIN')
 */
export const getSupportMessages = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const me = req.user!;
    const { userId, roomId, recipient } = req.query as { userId?: string; roomId?: string; recipient?: string };
    const channel: Channel = recipient === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN';

    let threadUserId = me.userId;
    let threadRoomId: string | null = null;

    if (me.role === 'USER') {
      threadUserId = me.userId;
      if (channel === 'ADMIN') {
        if (!roomId) return badRequest(res, 'roomId kerak');
        threadRoomId = String(roomId);
        const room = await prisma.computerRoom.findUnique({ where: { id: threadRoomId } });
        if (!room) return notFoundMsg(res, 'Xona topilmadi');
      }
    } else if (me.role === 'ADMIN') {
      if (channel === 'ADMIN') {
        const myRoom = await prisma.computerRoom.findUnique({ where: { ownerId: me.userId } });
        if (!myRoom) return forbidden(res, 'Sizda xona biriktirilmagan');
        if (!userId) {
          // Admin o'z murojaatini yangilash (super_admin bilan) — channel bo'lsa
          return ok(res, { messages: [], userId: me.userId });
        }
        const target = await prisma.user.findUnique({ where: { id: String(userId) } });
        if (!target) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
        threadUserId = target.id;
        threadRoomId = myRoom.id;
      } else {
        threadUserId = me.userId;
      }
    } else {
      if (!userId) return badRequest(res, 'userId kerak');
      const target = await prisma.user.findUnique({ where: { id: String(userId) } });
      if (!target) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
      threadUserId = target.id;
      if (channel === 'ADMIN') {
        if (!roomId) return badRequest(res, 'roomId kerak');
        threadRoomId = String(roomId);
      }
    }

    const messages = await prisma.supportMessage.findMany({
      where: {
        userId: threadUserId,
        recipientRole: channel,
        ...(threadRoomId ? { roomId: threadRoomId } : {}),
      },
      include: SUPPORT_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    // O'qilgan deb belgilash — boshqa taraf yuborganlarini
    await prisma.supportMessage.updateMany({
      where: {
        userId: threadUserId,
        recipientRole: channel,
        ...(threadRoomId ? { roomId: threadRoomId } : {}),
        isRead: false,
        senderId: { not: me.userId },
      },
      data: { isRead: true },
    });

    return ok(res, { messages, userId: threadUserId });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/support/threads?channel=&scope=
 * - ADMIN: o'z xonasidagi USER murojaatlari (ADMIN kanali) — user ism+tel ko'rinadi
 * - SUPER_ADMIN: SUPER_ADMIN kanali threadlari (user/admin), scope bo'yicha filtrlash
 */
export const getSupportThreads = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const me = req.user!;
    const { channel, scope } = req.query as { channel?: string; scope?: string };
    const targetChannel: Channel = channel === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN';

    let threads: any[] = [];

    if (me.role === 'ADMIN') {
      const myRoom = await prisma.computerRoom.findUnique({ where: { ownerId: me.userId } });
      if (!myRoom) return ok(res, []);
      const msgs = await prisma.supportMessage.findMany({
        where: { recipientRole: 'ADMIN', roomId: myRoom.id },
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, role: true } },
          room: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      const byKey = new Map<string, any>();
      for (const m of msgs) {
        const key = `${m.userId}:${m.roomId}`;
        const cur = byKey.get(key) || { user: m.user, room: m.room, unread: 0, total: 0, lastMessage: null };
        if (m.senderId !== me.userId && !m.isRead) cur.unread += 1;
        cur.total += 1;
        if (!cur.lastMessage) cur.lastMessage = m;
        byKey.set(key, cur);
      }
      threads = Array.from(byKey.values()).sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
    } else if (me.role === 'SUPER_ADMIN') {
      const msgs = await prisma.supportMessage.findMany({
        where: { recipientRole: targetChannel },
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, role: true } },
          room: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      });
      const byKey = new Map<string, any>();
      for (const m of msgs) {
        const key = targetChannel === 'ADMIN' ? `${m.userId}:${m.roomId}` : m.userId;
        const cur = byKey.get(key) || { user: m.user, room: m.room, unread: 0, total: 0, lastMessage: null };
        if (m.senderId !== me.userId && !m.isRead) cur.unread += 1;
        cur.total += 1;
        if (!cur.lastMessage) cur.lastMessage = m;
        byKey.set(key, cur);
      }
      let list = Array.from(byKey.values()).sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
      if (scope === 'users') list = list.filter((t) => t.user.role === 'USER');
      else if (scope === 'admins') list = list.filter((t) => t.user.role !== 'USER');
      threads = list;
    } else {
      return forbidden(res, 'Ruxsat yo\'q');
    }

    return ok(res, threads);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/support/my-rooms — USER: admin kanali uchun xona ro'yxati
 * (murojaat qilingan + bron qilingan xonalar)
 */
export const getMySupportRooms = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req.user!.role) && !isSuperAdmin(req.user!.role) && req.user!.role !== 'USER') {
      return forbidden(res, 'Ruxsat yo\'q');
    }
    const me = req.user!;

    const [booked, threads, active] = await Promise.all([
      prisma.booking.findMany({ where: { userId: me.userId }, select: { roomId: true } }),
      prisma.supportMessage.findMany({
        where: { userId: me.userId, recipientRole: 'ADMIN' },
        distinct: ['roomId'],
        select: { roomId: true },
      }),
      prisma.computerRoom.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, take: 10 }),
    ]);

    const idSet = new Set<string>();
    booked.forEach((b) => idSet.add(b.roomId));
    threads.forEach((t) => t.roomId && idSet.add(t.roomId));
    if (idSet.size === 0) active.forEach((r) => idSet.add(r.id));

    const rooms = await prisma.computerRoom.findMany({
      where: { id: { in: Array.from(idSet) } },
      select: {
        id: true,
        name: true,
        address: true,
        district: true,
        owner: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ok(res, rooms);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/support/threads/:userId?roomId=&channel= — thread tozalash
 */
export const clearSupportThread = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const me = req.user!;
    const { roomId, channel } = req.query as { roomId?: string; channel?: string };
    const targetChannel: Channel = channel === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN';
    const threadUserId = req.params.userId;

    if (me.role === 'ADMIN') {
      if (targetChannel !== 'ADMIN') return forbidden(res, 'Administrator o\'z murojaatlarini tozalamaydi');
      const myRoom = await prisma.computerRoom.findUnique({ where: { ownerId: me.userId } });
      if (!myRoom) return forbidden(res, 'Sizda xona biriktirilmagan');
      await prisma.supportMessage.deleteMany({
        where: { userId: threadUserId, recipientRole: 'ADMIN', roomId: myRoom.id },
      });
    } else if (me.role === 'SUPER_ADMIN') {
      await prisma.supportMessage.deleteMany({
        where: {
          userId: threadUserId,
          recipientRole: targetChannel,
          ...(targetChannel === 'ADMIN' && roomId ? { roomId: String(roomId) } : {}),
        },
      });
    } else {
      return forbidden(res, 'Ruxsat yo\'q');
    }

    return ok(res, null, 'Murojaat tozalandi');
  } catch (err) {
    next(err);
  }
};