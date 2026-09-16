import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';
import { io } from '../lib/socket';

// ============ GET /api/bar/rooms/:roomId/items — menyu ============
export const getBarItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.barItem.findMany({
      where: { roomId: req.params.roomId, isAvailable: true },
      orderBy: { category: 'asc' },
    });
    return ok(res, items);
  } catch (err) {
    next(err);
  }
};

// ============ ADMIN: barcha itemlar (nofaollar ham) ============
export const getBarItemsAll = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const isSuper = req.user!.role === 'SUPER_ADMIN';
    if (isSuper) {
      // Super admin: xona bo'yicha tanlab olish (roomId query)
      const items = await prisma.barItem.findMany({
        where: req.query.roomId ? { roomId: String(req.query.roomId) } : {},
        orderBy: { createdAt: 'desc' },
      });
      return ok(res, items);
    }

    const room = await prisma.computerRoom.findUnique({ where: { ownerId: req.user!.userId } });
    if (!room) return badRequest(res, 'Sizda kompyuter xona yo\'q');

    const items = await prisma.barItem.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, items);
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/bar/items — ADMIN: menyu qo'shish ============
export const createBarItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, price, category, imageUrl } = req.body;
    if (!name || !price) return badRequest(res, 'Nom va narx majburiy');

    let roomId: string;
    if (req.user!.role === 'SUPER_ADMIN') {
      if (!req.body.roomId) return badRequest(res, 'roomId majburiy (super admin uchun)');
      roomId = req.body.roomId;
    } else {
      const room = await prisma.computerRoom.findUnique({ where: { ownerId: req.user!.userId } });
      if (!room) return badRequest(res, 'Sizda kompyuter xona yo\'q');
      roomId = room.id;
    }

    const item = await prisma.barItem.create({
      data: {
        roomId,
        name,
        description,
        price: Number(price),
        category: category || 'DRINK',
        imageUrl,
      },
    });
    return created(res, item, 'Menyu qo\'shildi');
  } catch (err) {
    next(err);
  }
};

// ============ PATCH /api/bar/items/:id — ADMIN: tahrirlash / holat ============
export const updateBarItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.barItem.findUnique({
      where: { id: req.params.id },
      include: { room: { select: { ownerId: true } } },
    });
    if (!item) return notFoundMsg(res, 'Menyu topilmadi');
    if (item.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res);
    }

    const { name, description, price, category, imageUrl, isAvailable } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = Number(price);
    if (category !== undefined) data.category = category;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (isAvailable !== undefined) data.isAvailable = Boolean(isAvailable);

    const updated = await prisma.barItem.update({ where: { id: item.id }, data });
    return ok(res, updated, 'Menyu yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/bar/items/:id — ADMIN ============
export const deleteBarItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.barItem.findUnique({
      where: { id: req.params.id },
      include: { room: { select: { ownerId: true } } },
    });
    if (!item) return notFoundMsg(res, 'Menyu topilmadi');
    if (item.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res);
    }
    await prisma.barItem.delete({ where: { id: item.id } });
    return ok(res, null, 'Menyu o\'chirildi');
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/bar/orders — USER: buyurtma ============
export const createBarOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { roomId, bookingId, seatNumber, items } = req.body;
    if (!roomId || !Array.isArray(items) || items.length === 0) {
      return badRequest(res, 'roomId va buyurtma ro\'yxati majburiy');
    }

    const room = await prisma.computerRoom.findUnique({ where: { id: roomId } });
    if (!room) return notFoundMsg(res, 'Xona topilmadi');

    // Narx serverda hisoblanadi (qalbakilashtirishdan himoya)
    let total = 0;
    const lines: any[] = [];
    for (const line of items) {
      const item = await prisma.barItem.findUnique({ where: { id: line.itemId } });
      if (!item || item.roomId !== roomId) return badRequest(res, 'Menyu topilmadi');
      const qty = Math.max(1, Number(line.qty) || 1);
      const price = Number(item.price.toString());
      total += price * qty;
      lines.push({ itemId: item.id, name: item.name, price, qty });
    }

    const order = await prisma.barOrder.create({
      data: {
        roomId,
        bookingId: bookingId || null,
        userId: req.user!.userId,
        seatNumber: seatNumber || null,
        items: lines,
        totalPrice: total,
        status: 'PENDING',
      },
    });

    const notifyUserId = room.ownerId;
    await prisma.notification.create({
      data: {
        userId: notifyUserId,
        title: 'Yangi bar buyurtma',
        message: `${total} so'm — ${lines.reduce((s, l) => s + l.qty, 0)} ta mahsulot (${seatNumber || 'stol'})`,
        type: 'bar',
      },
    });
    io.emit('notification_new', { userId: notifyUserId, type: 'bar' });

    return created(res, order, 'Buyurtma qabul qilindi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/bar/orders/my — USER: o'z buyurtmalari ============
export const getMyBarOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orders = await prisma.barOrder.findMany({
      where: { userId: req.user!.userId },
      include: {
        room: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ok(res, orders);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/admin/bar/orders — ADMIN: xona buyurtmalari ============
export const getRoomBarOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const isSuper = req.user!.role === 'SUPER_ADMIN';
    if (isSuper && req.query.all === 'true') {
      const orders = await prisma.barOrder.findMany({
        include: {
          room: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
      return ok(res, orders);
    }

    const room = await prisma.computerRoom.findUnique({ where: { ownerId: req.user!.userId } });
    if (!room) return badRequest(res, 'Sizda kompyuter xona yo\'q');

    const orders = await prisma.barOrder.findMany({
      where: { roomId: room.id },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
        booking: { select: { id: true, date: true, startTime: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok(res, orders);
  } catch (err) {
    next(err);
  }
};

// ============ PATCH /api/admin/bar/orders/:id/status — ADMIN ============
export const updateBarOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const allowed = ['PREPARING', 'READY', 'DELIVERED', 'CANCELLED'];
    if (!status || !allowed.includes(status)) return badRequest(res, `Status: ${allowed.join(', ')}`);

    const order = await prisma.barOrder.findUnique({
      where: { id: req.params.id },
      include: { room: { select: { ownerId: true } }, user: { select: { id: true } } },
    });
    if (!order) return notFoundMsg(res, 'Buyurtma topilmadi');
    if (order.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res);
    }

    const updated = await prisma.barOrder.update({
      where: { id: order.id },
      data: { status },
    });

    io.emit('bar_order_status', { orderId: order.id, status, userId: order.user.id });

    return ok(res, updated, 'Buyurtma holati yangilandi');
  } catch (err) {
    next(err);
  }
};