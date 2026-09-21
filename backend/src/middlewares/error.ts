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
  // Ichki tafsilotlar (SMTP xato matni, SQL, stack) foydalanuvchiga chiqarilmaydi —
  // faqat logda qoladi. Foydalanuvchiga tushunarli umumiy xabar.
  return res.status(status).json({
    success: false,
    message: status >= 500 ? 'Serverda xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko\'ring.' : err.message || 'Noto\'g\'ri so\'rov',
  });
}

export function notFound(req: Request, res: Response) {
  return res.status(404).json({ success: false, message: `Route topilmadi: ${req.method} ${req.path}` });
}