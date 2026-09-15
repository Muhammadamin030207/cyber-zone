import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';

// ============ GET /api/news — PUBLIC: yangiliklar va reklamalar ============
export const getNews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.query as { type?: string };
    const where: any = { isActive: true };
    if (type) where.type = type.toUpperCase();

    const news = await prisma.news.findMany({
      where,
      include: {
        room: { select: { id: true, name: true } },
        author: { select: { id: true, fullName: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });
    return ok(res, news);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/rooms/:roomId/news — PUBLIC: xona yangiliklari ============
export const getRoomNews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const news = await prisma.news.findMany({
      where: { roomId: req.params.roomId, isActive: true },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { publishedAt: 'desc' },
    });
    return ok(res, news);
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/news — ADMIN/SUPER_ADMIN: yangilik yaratish ============
export const createNews = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title, content, imageUrl, type, roomId } = req.body;
    if (!title || !content) return badRequest(res, 'title va content majburiy');

    // Admin faqat o'z xonasiga yozishi mumkin
    const assignedRoomId = roomId || null;
    if (assignedRoomId && req.user!.role === 'ADMIN') {
      const room = await prisma.computerRoom.findUnique({ where: { id: assignedRoomId } });
      if (!room || room.ownerId !== req.user!.userId) {
        return forbidden(res, 'Faqat o\'z xonangizga yangilik yozasiz');
      }
    }

    const news = await prisma.news.create({
      data: {
        title,
        content,
        imageUrl,
        type: type ? type.toUpperCase() : 'NEWS',
        roomId: assignedRoomId,
        authorId: req.user!.userId,
      },
      include: { room: { select: { id: true, name: true } } },
    });

    return created(res, news, 'Yangilik joylandi');
  } catch (err) {
    next(err);
  }
};

// ============ PUT /api/news/:id — tahrirlash ============
export const updateNews = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const news = await prisma.news.findUnique({ where: { id: req.params.id } });
    if (!news) return notFoundMsg(res, 'Yangilik topilmadi');

    if (req.user!.role === 'ADMIN') {
      if (!news.roomId) return forbidden(res);
      const room = await prisma.computerRoom.findUnique({ where: { id: news.roomId } });
      if (!room || room.ownerId !== req.user!.userId) return forbidden(res);
    }

    const { title, content, imageUrl, type, isActive } = req.body;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (type !== undefined) data.type = type.toUpperCase();
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await prisma.news.update({
      where: { id: req.params.id },
      data,
    });

    return ok(res, updated, 'Yangilik yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/news/:id ============
export const deleteNews = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const news = await prisma.news.findUnique({ where: { id: req.params.id } });
    if (!news) return notFoundMsg(res, 'Yangilik topilmadi');

    if (req.user!.role === 'ADMIN') {
      if (!news.roomId) return forbidden(res);
      const room = await prisma.computerRoom.findUnique({ where: { id: news.roomId } });
      if (!room || room.ownerId !== req.user!.userId) return forbidden(res);
    }

    await prisma.news.delete({ where: { id: req.params.id } });
    return ok(res, null, 'Yangilik o\'chirildi');
  } catch (err) {
    next(err);
  }
};