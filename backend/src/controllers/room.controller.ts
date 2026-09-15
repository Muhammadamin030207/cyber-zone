import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';

const ROOM_INCLUDE = {
  zones: {
    include: {
      computers: true,
    },
  },
  reviews: {
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  },
};

// ============ GET /api/rooms — PUBLIC: barcha xonalar (filtrlash bilan) ============
export const getRooms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, location, type, price_min, price_max, sort } = req.query as {
      query?: string;
      location?: string;
      type?: string;
      price_min?: string;
      price_max?: string;
      sort?: string;
    };

    const where: any = { status: 'ACTIVE' };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { address: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (location) {
      where.address = { contains: location, mode: 'insensitive' };
    }

    if (type) {
      where.zones = {
        some: { type: type.toUpperCase() },
      };
    }

    if (price_min || price_max) {
      where.zones = {
        ...(where.zones || {}),
        some: {
          ...(where.zones?.some || {}),
          pricePerHour: {
            ...(price_min ? { gte: Number(price_min) } : {}),
            ...(price_max ? { lte: Number(price_max) } : {}),
          },
        },
      };
    }

    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'price_asc') orderBy = { zones: { _count: 'asc' } };
    if (sort === 'rating_asc') orderBy = { reviews: { _count: 'asc' } };

    const rooms = await prisma.computerRoom.findMany({
      where,
      include: {
        _count: { select: { zones: true, reviews: true, bookings: true } },
        zones: {
          select: { id: true, type: true, name: true, pricePerHour: true, capacity: true },
        },
      },
      orderBy,
    });

    return ok(res, rooms);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/rooms/:id — PUBLIC: bitta xona ============
export const getRoomById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = await prisma.computerRoom.findUnique({
      where: { id: req.params.id },
      include: ROOM_INCLUDE,
    });

    if (!room) return notFoundMsg(res, 'Kompyuter xona topilmadi');

    const avgRating = await prisma.review.aggregate({
      where: { roomId: room.id },
      _avg: { rating: true },
      _count: true,
    });

    return ok(res, {
      ...room,
      avgRating: avgRating._avg.rating || 0,
      ratingCount: avgRating._count,
    });
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/rooms — ADMIN: yangi xona ============
export const createRoom = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, address, latitude, longitude, phone, workingHours, timezone, images, status } = req.body;

    // 1 admin = 1 xona qoidasi
    const existing = await prisma.computerRoom.findUnique({
      where: { ownerId: req.user!.userId },
    });
    if (existing) return badRequest(res, 'Siz allaqachon kompyuter xonaga egasiz (1 admin = 1 xona)');

    const room = await prisma.computerRoom.create({
      data: {
        ownerId: req.user!.userId,
        name,
        description,
        address,
        latitude,
        longitude,
        phone,
        workingHours: workingHours || { open: '09:00', close: '23:00' },
        timezone: timezone || 'Asia/Tashkent',
        images: images || [],
        status: status || 'PENDING',
      },
      include: ROOM_INCLUDE,
    });

    return created(res, room, 'Kompyuter xona yaratildi');
  } catch (err) {
    next(err);
  }
};

// ============ PUT /api/rooms/:id — ADMIN: xonani yangilash ============
export const updateRoom = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const room = await prisma.computerRoom.findUnique({ where: { id: req.params.id } });
    if (!room) return notFoundMsg(res, 'Kompyuter xona topilmadi');
    if (room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res, 'Faqat o\'z xonangizni tahrirlashingiz mumkin');
    }

    const { name, description, address, latitude, longitude, phone, workingHours, timezone, images, status } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (address !== undefined) data.address = address;
    if (latitude !== undefined) data.latitude = latitude;
    if (longitude !== undefined) data.longitude = longitude;
    if (phone !== undefined) data.phone = phone;
    if (workingHours !== undefined) data.workingHours = workingHours;
    if (timezone !== undefined) data.timezone = timezone;
    if (images !== undefined) data.images = images;
    if (status !== undefined) data.status = status;

    const updated = await prisma.computerRoom.update({
      where: { id: req.params.id },
      data,
      include: ROOM_INCLUDE,
    });

    return ok(res, updated, 'Kompyuter xona yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/rooms/:id — SUPER_ADMIN: xonani o'chirish ============
export const deleteRoom = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const room = await prisma.computerRoom.findUnique({ where: { id: req.params.id } });
    if (!room) return notFoundMsg(res, 'Kompyuter xona topilmadi');
    if (room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res, 'Faqat o\'z xonangizni o\'chirishingiz mumkin');
    }

    await prisma.computerRoom.delete({ where: { id: req.params.id } });
    return ok(res, null, 'Kompyuter xona o\'chirildi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/rooms/:id/stats — ADMIN: statistika ============
export const getRoomStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const room = await prisma.computerRoom.findUnique({ where: { id: req.params.id } });
    if (!room) return notFoundMsg(res, 'Kompyuter xona topilmadi');
    if (room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
      return forbidden(res, 'Faqat o\'z xonangiz statistikasini ko\'rasiz');
    }

    const { from, to } = req.query as { from?: string; to?: string };
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    const [totalBookings, activeBookings, completedBookings, revenue, zoneCount, computerCount] = await Promise.all([
      prisma.booking.count({ where: { roomId: room.id, date: { gte: dateFrom, lte: dateTo } } }),
      prisma.booking.count({ where: { roomId: room.id, status: 'ACTIVE' } }),
      prisma.booking.count({ where: { roomId: room.id, status: 'COMPLETED' } }),
      prisma.payment.aggregate({
        where: { booking: { roomId: room.id }, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.zone.count({ where: { roomId: room.id } }),
      prisma.computer.count({ where: { zone: { roomId: room.id } } }),
    ]);

    return ok(res, {
      totalBookings,
      activeBookings,
      completedBookings,
      revenue: revenue._sum.amount || 0,
      zoneCount,
      computerCount,
    });
  } catch (err) {
    next(err);
  }
};