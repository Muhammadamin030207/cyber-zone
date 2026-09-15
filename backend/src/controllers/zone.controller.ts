import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, forbidden, notFoundMsg } from '../utils/response';

async function assertOwner(req: AuthRequest, res: Response, roomId: string): Promise<boolean> {
  const room = await prisma.computerRoom.findUnique({ where: { id: roomId } });
  if (!room) {
    notFoundMsg(res, 'Kompyuter xona topilmadi');
    return false;
  }
  if (room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
    forbidden(res, 'Faqat o\'z xonangiz zonalarini boshqarasiz');
    return false;
  }
  return true;
}

// ============ GET /api/rooms/:roomId/zones — PUBLIC: xona zonalari ============
export const getZones = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const zones = await prisma.zone.findMany({
      where: { roomId: req.params.roomId },
      include: { computers: true },
      orderBy: { createdAt: 'asc' },
    });
    return ok(res, zones);
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/rooms/:roomId/zones — ADMIN: zona qo'shish ============
export const createZone = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, name, description, capacity, pricePerHour } = req.body;

    const allowed = await assertOwner(req, res, req.params.roomId);
    if (!allowed) return;

    const zone = await prisma.zone.create({
      data: {
        roomId: req.params.roomId,
        type,
        name,
        description,
        capacity: capacity || 0,
        pricePerHour,
      },
      include: { computers: true },
    });

    return created(res, zone, 'Zona qo\'shildi');
  } catch (err) {
    next(err);
  }
};

// ============ PUT /api/zones/:id — ADMIN: zona yangilash ============
export const updateZone = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const zone = await prisma.zone.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!zone) return notFoundMsg(res, 'Zona topilmadi');

    const allowed = await assertOwner(req, res, zone.roomId);
    if (!allowed) return;

    const { type, name, description, capacity, pricePerHour } = req.body;

    const data: any = {};
    if (type !== undefined) data.type = type;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (capacity !== undefined) data.capacity = capacity;
    if (pricePerHour !== undefined) data.pricePerHour = pricePerHour;

    const updated = await prisma.zone.update({
      where: { id: req.params.id },
      data,
      include: { computers: true },
    });

    return ok(res, updated, 'Zona yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/zones/:id — ADMIN: zona o'chirish ============
export const deleteZone = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const zone = await prisma.zone.findUnique({ where: { id: req.params.id } });
    if (!zone) return notFoundMsg(res, 'Zona topilmadi');

    const allowed = await assertOwner(req, res, zone.roomId);
    if (!allowed) return;

    await prisma.zone.delete({ where: { id: req.params.id } });
    return ok(res, null, 'Zona o\'chirildi');
  } catch (err) {
    next(err);
  }
};