import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('[ERROR]', err);

  if (err.code === 'P2002') {
    return res.status(409).json({ success: false, message: 'Bunday ma\'lumot allaqachon mavjud' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Topilmadi' });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ success: false, message: 'Bog\'liq ma\'lumot topilmadi yoki noto\'g\'ri' });
  }

  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    message: err.message || 'Serverda xatolik yuz berdi',
  });
}

export function notFound(req: Request, res: Response) {
  return res.status(404).json({ success: false, message: `Route topilmadi: ${req.method} ${req.path}` });
}