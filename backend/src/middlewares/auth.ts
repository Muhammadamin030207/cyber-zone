import { Request, Response, NextFunction } from 'express';
import { AuthRequest, JwtPayload } from '../types';
import { verifyAccessToken } from '../lib/jwt';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token topilmadi' });
    }

    const token = header.split(' ')[1];
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token yaroqsiz yoki muddati otgan' });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Avtentifikatsiya talab qilinadi' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Ruxsat yoq' });
    }
    next();
  };
}