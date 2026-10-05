import { Response } from 'express';

export const ok = (res: Response, data: any, message = 'Muvaffaqiyatli') =>
  res.status(200).json({ success: true, message, data });

export const created = (res: Response, data: any, message = 'Yaratildi') =>
  res.status(201).json({ success: true, message, data });

export const badRequest = (res: Response, message = 'Noto\'g\'ri so\'rov', code?: string) =>
  res.status(400).json(code ? { success: false, message, code } : { success: false, message });

export const unauthorized = (res: Response, message = 'Ruxsat yo\'q') =>
  res.status(401).json({ success: false, message });

export const forbidden = (res: Response, message = 'Sizga ruxsat berilmagan', code?: string) =>
  res.status(403).json(code ? { success: false, message, code } : { success: false, message });

export const notFoundMsg = (res: Response, message = 'Topilmadi') =>
  res.status(404).json({ success: false, message });

export const notImplemented = (res: Response, message = 'Hali amalga oshirilmagan', code?: string) =>
  res.status(501).json(code ? { success: false, message, code } : { success: false, message });

export const serverError = (res: Response, message = 'Server xatosi', code?: string) =>
  res.status(500).json(code ? { success: false, message, code } : { success: false, message });