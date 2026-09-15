import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, badRequest, forbidden, notFoundMsg } from '../utils/response';

function sanitizeUser(u: any) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ============ GET /api/users — SUPER_ADMIN: barcha foydalanuvchilar ============
export const getAllUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role, search, limit, offset } = req.query as { role?: string; search?: string; limit?: string; offset?: string };

    const where: any = {};
    if (role) where.role = role.toUpperCase();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          avatarUrl: true,
          role: true,
          language: true,
          status: true,
          createdAt: true,
          _count: { select: { bookings: true, payments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit) || 50,
        skip: Number(offset) || 0,
      }),
      prisma.user.count({ where }),
    ]);

    return ok(res, { users, total });
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/users/admins — SUPER_ADMIN: admin yaratish ============
export const createAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { email, fullName, password, phone, language } = req.body;

    if (!email || !fullName || !password) {
      return badRequest(res, 'email, fullName, password majburiy');
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest(res, 'Bunday email allaqachon mavjud');

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
        language: language || 'uz',
        role: 'ADMIN',
      },
    });

    return created(res, sanitizeUser(admin), 'Admin yaratildi');
  } catch (err) {
    next(err);
  }
};

// ============ PATCH /api/users/:id/status — SUPER_ADMIN: bloklash/faollashtirish ============
export const toggleUserStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!status || !['ACTIVE', 'BLOCKED'].includes(status.toUpperCase())) {
      return badRequest(res, 'Status: ACTIVE yoki BLOCKED');
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return notFoundMsg(res, 'Foydalanuvchi topilmadi');

    if (user.role === 'SUPER_ADMIN' && req.user!.userId !== user.id) {
      return forbidden(res, 'Super adminni bloklab bo\'lmaydi');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { status: status.toUpperCase() },
    });

    return ok(res, sanitizeUser(updated), status === 'BLOCKED' ? 'Foydalanuvchi bloklandi' : 'Foydalanuvchi faollashtirildi');
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/users/:id — SUPER_ADMIN: o'chirish ============
export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { computerRoom: { select: { id: true } } },
    });
    if (!user) return notFoundMsg(res, 'Foydalanuvchi topilmadi');

    if (user.role === 'SUPER_ADMIN') return forbidden(res, 'Super adminni o\'chirib bo\'lmaydi');
    if (user.role === 'ADMIN' && user.computerRoom) {
      return badRequest(res, 'Xonasi bor adminni o\'chirib bo\'lmaydi. Avval xonani o\'chiring');
    }

    await prisma.user.delete({ where: { id: user.id } });
    return ok(res, null, 'Foydalanuvchi o\'chirildi');
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/users/:id — bitta foydalanuvchi ============
export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        role: true,
        language: true,
        status: true,
        createdAt: true,
        computerRoom: { select: { id: true, name: true, address: true, status: true } },
      },
    });
    if (!user) return notFoundMsg(res, 'Foydalanuvchi topilmadi');
    return ok(res, user);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/super-admin/stats — SUPER_ADMIN: umumiy statistika ============
export const getSuperAdminStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [totalUsers, totalAdmins, totalRooms, totalBookings, totalRevenue, activeBookings] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.computerRoom.count({ where: { status: 'ACTIVE' } }),
      prisma.booking.count(),
      prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
      prisma.booking.count({ where: { status: 'ACTIVE' } }),
    ]);

    const recentRooms = await prisma.computerRoom.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { bookings: true } } },
    });

    return ok(res, {
      totalUsers,
      totalAdmins,
      totalRooms,
      totalBookings,
      totalRevenue: totalRevenue._sum.amount || 0,
      activeBookings,
      recentRooms,
    });
  } catch (err) {
    next(err);
  }
};