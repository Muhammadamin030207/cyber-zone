import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis';
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

const LIST_TTL = 60;
const DETAIL_TTL = 300;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ============ YORDAMCHI: fuzzy qidiruv (Levenshtein — 1-2 ta xato harfga chidamli) ============
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/o'|oʻ|о|ө/g, 'o')
    .replace(/g'|gʻ|ғ/g, 'g')
    .replace(/sh|ç/g, 'sh')
    .replace(/ch|č/g, 'ch')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyMatches(query: string, candidate: string): boolean {
  const q = normalizeText(query);
  const c = normalizeText(candidate);
  if (!q || !c) return false;
  if (c.includes(q)) return true;

  const qWords = q.split(' ').filter(Boolean);
  const cWords = c.split(' ').filter(Boolean);
  if (!qWords.length) return false;

  // Har bir so'z kandidat so'zlaridan biri bilan mos kelishi kerak (2 tagacha xato)
  return qWords.every((qw) => {
    if (qw.length < 3) return cWords.some((w) => w.startsWith(qw));
    const limit = qw.length < 5 ? 1 : 2;
    return cWords.some((w) => w.startsWith(qw) || levenshtein(qw, w) <= limit);
  });
}

// ============ GET /api/rooms — PUBLIC: barcha xonalar (filtrlash bilan) ============
export const getRooms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, location, district, type, price_min, price_max, sort } = req.query as {
      query?: string;
      location?: string;
      district?: string;
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

    if (query && !district && !type && !price_min && !price_max) {
      // Birinchi bo'lib aniq (contains) natijani tekshiramiz
      const exact = await prisma.computerRoom.findFirst({ where });
      if (!exact) {
        // Aniq natija yo'q → fuzzy: barcha faol xonalar orasidan yaqin moslik
        const all = await prisma.computerRoom.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, address: true },
        });
        const fuzzyIds = all
          .filter((r) => fuzzyMatches(String(query), r.name) || fuzzyMatches(String(query), r.address))
          .slice(0, 10)
          .map((r) => r.id);
        if (fuzzyIds.length) {
          where.id = { in: fuzzyIds };
          where.OR = undefined;
        }
      }
    }

    if (district) {
      where.district = { contains: district, mode: 'insensitive' };
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

    const cacheKey = `rooms:list:${JSON.stringify({ query, location, district, type, price_min, price_max, sort })}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return ok(res, cached);

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

    await cacheSet(cacheKey, rooms, LIST_TTL);

    return ok(res, rooms);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/rooms/nearby — PUBLIC: lokatsiya bo'yicha eng yaqin xonalar ============
export const getNearbyRooms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat, lng, radius = '10' } = req.query as { lat?: string; lng?: string; radius?: string };
    const latN = Number(lat);
    const lngN = Number(lng);
    const radiusN = Number(radius) || 10;

    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return badRequest(res, 'lat va lng talab qilinadi');
    }

    const rooms = await prisma.computerRoom.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        latitude: true,
        longitude: true,
        phone: true,
        images: true,
        createdAt: true,
        zones: { select: { id: true, type: true, name: true, pricePerHour: true, capacity: true } },
        _count: { select: { reviews: true } },
      },
    });

    const result = rooms
      .map((room) => {
        const distanceKm =
          room.latitude != null && room.longitude != null
            ? Math.round(haversine(latN, lngN, room.latitude, room.longitude) * 10) / 10
            : null;
        return { ...room, distanceKm };
      })
      .filter((room) => room.distanceKm === null || room.distanceKm <= radiusN)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    return ok(res, result);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/rooms/:id — PUBLIC: bitta xona ============
export const getRoomById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = `rooms:detail:${req.params.id}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return ok(res, cached);

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

    const payload = {
      ...room,
      avgRating: avgRating._avg.rating || 0,
      ratingCount: avgRating._count,
    };

    await cacheSet(cacheKey, payload, DETAIL_TTL);

    return ok(res, payload);
  } catch (err) {
    next(err);
  }
};

async function invalidateRoomCaches(roomId?: string) {
  await cacheDel('rooms:list:*');
  if (roomId) await cacheDel(`rooms:detail:${roomId}`);
}

// ============ POST /api/rooms — ADMIN: yangi xona ============
export const createRoom = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, address, district, city, latitude, longitude, phone, workingHours, timezone, images, status } = req.body;

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
        district,
        city: city || 'Toshkent',
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

    await invalidateRoomCaches(room.id);
    return created(res, room, 'Kompyuter xona yaratildi');
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/rooms/super-admin — SUPER_ADMIN: xona + zona + kompyuter yaratish ============
// Super admin yangi xona yaratadi va uni belgilangan ADMIN foydalanuvchiga biriktiradi
export const createRoomBySuperAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      description,
      address,
      district,
      city,
      latitude,
      longitude,
      phone,
      workingHours,
      ownerId,
      zones,
      status,
    } = req.body;

    if (!name || !address) return badRequest(res, 'Xona nomi va manzili majburiy');
    if (!ownerId) return badRequest(res, 'Xonaga tayinlanadigan admin (ownerId) majburiy');

    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) return notFoundMsg(res, 'Admin foydalanuvchi topilmadi');
    if (owner.role !== 'ADMIN') return badRequest(res, 'Faqat ADMIN roli xonaga egalik qilishi mumkin');

    const existing = await prisma.computerRoom.findUnique({ where: { ownerId } });
    if (existing) return badRequest(res, 'Bu admin allaqachon xonaga ega');

    const room = await prisma.$transaction(async (tx) => {
      const newRoom = await tx.computerRoom.create({
        data: {
          ownerId,
          name,
          description,
          address,
          district,
          city: city || 'Toshkent',
          latitude,
          longitude,
          phone,
          workingHours: workingHours || { open: '09:00', close: '23:00' },
          images: req.body.images || [],
          status: status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
        },
      });

      // Zonalar va kompyuterlar
      if (Array.isArray(zones)) {
        for (const z of zones) {
          const zone = await tx.zone.create({
            data: {
              roomId: newRoom.id,
              name: z.name || 'Umumiy zal',
              type: z.type || 'GENERAL_HALL',
              description: z.description,
              capacity: Number(z.capacity) || 0,
              pricePerHour: Number(z.pricePerHour) || 0,
            },
          });

          const compNames: string[] = Array.isArray(z.computers) && z.computers.length
            ? z.computers
            : Array.from({ length: Number(z.computerCount) || 0 }, (_, i) => `PC-${i + 1}-${zone.name[0] || 'Z'}`);

          await tx.computer.createMany({
            data: compNames.map((cn: any) => ({
              zoneId: zone.id,
              name: typeof cn === 'string' ? cn : `PC-${cn}`,
              specs: { cpu: 'Core i7', gpu: 'RTX 3060', ram: '16GB' },
            })),
          });

          await tx.zone.update({
            where: { id: zone.id },
            data: { capacity: Number(z.capacity) || compNames.length },
          });
        }
      }

      return tx.computerRoom.findUnique({
        where: { id: newRoom.id },
        include: ROOM_INCLUDE,
      });
    });

    return created(res, room, 'Xona va zonalar yaratildi');
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

    const { name, description, address, district, city, latitude, longitude, phone, workingHours, timezone, images, status } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (address !== undefined) data.address = address;
    if (district !== undefined) data.district = district;
    if (city !== undefined) data.city = city;
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

    await invalidateRoomCaches(updated.id);
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
    await invalidateRoomCaches(req.params.id);
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