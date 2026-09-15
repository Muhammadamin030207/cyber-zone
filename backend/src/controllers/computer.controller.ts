import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, created, forbidden, notFoundMsg } from '../utils/response';

async function isAdminOfZone(req: AuthRequest, res: Response, zoneId: string): Promise<boolean> {
  const zone = await prisma.zone.findUnique({
    where: { id: zoneId },
    include: { room: true },
  });
  if (!zone) {
    notFoundMsg(res, 'Zona topilmadi');
    return false;
  }
  if (zone.room.ownerId !== req.user!.userId && req.user!.role !== 'SUPER_ADMIN') {
    forbidden(res, 'Faqat o\'z xonangiz kompyuterlarini boshqarasiz');
    return false;
  }
  return true;
}

// ============ GET /api/zones/:zoneId/computers — PUBLIC: zona kompyuterlari ============
export const getComputersByZone = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const computers = await prisma.computer.findMany({
      where: { zoneId: req.params.zoneId },
      orderBy: { name: 'asc' },
    });
    return ok(res, computers);
  } catch (err) {
    next(err);
  }
};

// ============ GET /api/computers/:id — PUBLIC: bitta kompyuter ============
export const getComputerById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const computer = await prisma.computer.findUnique({
      where: { id: req.params.id },
      include: { zone: { include: { room: true } } },
    });
    if (!computer) return notFoundMsg(res, 'Kompyuter topilmadi');
    return ok(res, computer);
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/rooms/:roomId/zones/:zoneId/computers — ADMIN ============
export const createComputer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { zoneId } = req.params;
    const { name, specs } = req.body;

    const allowed = await isAdminOfZone(req, res, zoneId);
    if (!allowed) return;

    const computer = await prisma.computer.create({
      data: {
        zoneId,
        name,
        specs: specs || {},
        status: 'AVAILABLE',
      },
    });

    return created(res, computer, 'Kompyuter qo\'shildi');
  } catch (err) {
    next(err);
  }
};

// ============ PUT /api/computers/:id — ADMIN: kompyuter yangilash ============
export const updateComputer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const computer = await prisma.computer.findUnique({ where: { id: req.params.id } });
    if (!computer) return notFoundMsg(res, 'Kompyuter topilmadi');

    const allowed = await isAdminOfZone(req, res, computer.zoneId);
    if (!allowed) return;

    const { name, specs, status } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (specs !== undefined) data.specs = specs;
    if (status !== undefined) data.status = status;

    const updated = await prisma.computer.update({
      where: { id: req.params.id },
      data,
    });

    return ok(res, updated, 'Kompyuter yangilandi');
  } catch (err) {
    next(err);
  }
};

// ============ PATCH /api/computers/:id/status — ADMIN: holat o'zgartirish ============
export const updateComputerStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const computer = await prisma.computer.findUnique({ where: { id: req.params.id } });
    if (!computer) return notFoundMsg(res, 'Kompyuter topilmadi');

    const allowed = await isAdminOfZone(req, res, computer.zoneId);
    if (!allowed) return;

    const { status } = req.body;
    if (!status) return notFoundMsg(res, 'Status berilmagan');

    const updated = await prisma.computer.update({
      where: { id: req.params.id },
      data: { status },
    });

    return ok(res, updated, `Kompyuter holati: ${status}`);
  } catch (err) {
    next(err);
  }
};

// ============ DELETE /api/computers/:id — ADMIN: kompyuter o'chirish ============
export const deleteComputer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const computer = await prisma.computer.findUnique({ where: { id: req.params.id } });
    if (!computer) return notFoundMsg(res, 'Kompyuter topilmadi');

    const allowed = await isAdminOfZone(req, res, computer.zoneId);
    if (!allowed) return;

    await prisma.computer.delete({ where: { id: req.params.id } });
    return ok(res, null, 'Kompyuter o\'chirildi');
  } catch (err) {
    next(err);
  }
};