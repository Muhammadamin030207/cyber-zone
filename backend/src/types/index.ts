import { Request } from 'express';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
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