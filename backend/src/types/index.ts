import { Request } from 'express';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  /** Server-side sessiya bekor qilish uchun token versiyasi (logout/parol o'zgarishida oshadi). */
  tokenVersion?: number;
  /**
   * Token turi. `access` — to'liq API kirishi; `refresh` — yangilash;
   * `pending-2fa` / `pending-passkey` — ikkinchi faktor hali tasdiqlanmagan
   * oraliq token (hech qanday API kirishiga yolcha olmaydi).
   */
  type?: 'access' | 'refresh' | 'pending-2fa' | 'pending-passkey';
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}