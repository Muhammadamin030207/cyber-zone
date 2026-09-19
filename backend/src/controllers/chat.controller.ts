import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden } from '../utils/response';
import { io } from '../lib/socket';

// ============ GET /api/chat/rooms/:roomId/messages — chat tarixi ============
export const getRoomMessages = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const roomId = req.params.roomId;
    const room = await prisma.computerRoom.findUnique({ where: { id: roomId } });
    if (!room) return badRequest(res, 'Xona topilmadi');

    const messages = await prisma.chatMessage.findMany({
      where: { roomId },
      include: {
        user: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    // Ko'rildi deb belgilash (boshqa taraf messagelari)
    await prisma.chatMessage.updateMany({
      where: { roomId, userId: { not: req.user!.userId }, isRead: false },
      data: { isRead: true },
    });

    return ok(res, messages);
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/chat/rooms/:roomId/messages — xabar yuborish ============
export const sendMessage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;
    if (!message || !String(message).trim()) return badRequest(res, 'Xabar yozing');

    const room = await prisma.computerRoom.findUnique({ where: { id: req.params.roomId } });
    if (!room) return badRequest(res, 'Xona topilmadi');

    const msg = await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        userId: req.user!.userId,
        role: req.user!.role,
        message: String(message).trim().slice(0, 1000),
      },
      include: {
        user: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
      },
    });

    // Jonli yetkazish: xonaga qo'shilgan barchaga + qarama-qarshi tarafga
    // (egasi emas yozsa -> egasiga, egasi yozsa -> oxirgi USER qatnashuvchiga)
    io.to(`chat:room:${room.id}`).emit('chat:room:new', { roomId: room.id, message: msg });

    let notifyUserId = room.ownerId;
    if (msg.userId === room.ownerId) {
      const lastUserMsg = await prisma.chatMessage.findFirst({
        where: { roomId: room.id, userId: { not: room.ownerId }, role: 'USER' },
        orderBy: { createdAt: 'desc' },
      });
      notifyUserId = lastUserMsg?.userId || room.ownerId;
    }
    if (notifyUserId !== msg.userId) {
      io.to(`user:${notifyUserId}`).emit('chat:new', { roomId: room.id, message: msg });
      await prisma.notification.create({
        data: {
          userId: notifyUserId,
          title: 'Yangi chat xabari',
          message: `${msg.user.fullName}: ${msg.message.slice(0, 60)}`,
          type: 'bar',
        },
      }).catch(() => { /* notification muhim emas */ });
    }

    return created(res, msg);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/chat/admin/rooms — ADMIN: chatlar ro'yxati + o'qilmagan ============
export const getAdminChatRooms = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const where = req.user!.role === 'SUPER_ADMIN' ? {} : { ownerId: req.user!.userId };

    const rooms = await prisma.computerRoom.findMany({
      where,
      include: {
        _count: {
          select: {
            chatMessages: {
              where: { isRead: false, userId: { not: req.user!.userId } },
            },
          },
        },
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { user: { select: { fullName: true, role: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const list = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      unread: r._count.chatMessages,
      lastMessage: r.chatMessages[0] || null,
    }));

    return ok(res, list);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/chat/user/rooms — USER: o'zi ishtirok etgan chatlar ============
export const getUserChatRooms = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.user!.userId },
      select: { roomId: true },
      distinct: ['roomId'],
    });

    const roomIds = messages.map((m) => m.roomId);
    const rooms = await prisma.computerRoom.findMany({
      where: { id: { in: roomIds } },
      include: { _count: { select: { chatMessages: { where: { isRead: false, userId: { not: req.user!.userId } } } } } },
      orderBy: { createdAt: 'desc' },
    });

    return ok(res, rooms.map((r) => {
      const firstImg = (r.images as unknown as string[] | null)?.[0] || null;
      return { id: r.id, name: r.name, address: r.address, image: firstImg, unread: r._count.chatMessages };
    }));
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/chat/rooms/:roomId/clear — SUPER_ADMIN ============
export const clearRoomChat = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const room = await prisma.computerRoom.findUnique({ where: { id: req.params.roomId } });
    if (!room) return badRequest(res, 'Xona topilmadi');
    if (room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') return forbidden(res);

    await prisma.chatMessage.deleteMany({ where: { roomId: room.id } });
    return ok(res, null, 'Suhbat tozalandi');
  } catch (err) {
    next(err);
  }
};