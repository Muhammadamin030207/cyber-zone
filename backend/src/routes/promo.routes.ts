import { Router } from 'express';
import {
  getMyPromos,
  createPromo,
  updatePromo,
  deletePromo,
  checkPromo,
  getMyPromosUser,
  getPublicPromos,
} from '../controllers/promo.controller';
import { authenticate, authorize, optionalAuthenticate } from '../middlewares/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Kodni tekshirish — rate-limit majburiy. Bu endpoint promo-kodlarni
// enumeratsiya qilish uchun ishlatilishi mumkin (shaxsiy single-use kodlar),
// shuning uchun IP bo'yicha cheklov qo'yiladi.
const promoCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userId || req.ip || 'unknown',
  message: { success: false, message: 'Juda ko\'p urinish. Biroz kutib turing.' },
});

// `optionalAuthenticate` — kirishsiz ham ishlaydi, lekin token yuborilsa
// shaxsiy limit ("allaqachon ishlatilgan") HAM tekshiriladi.
router.get('/check', promoCheckLimiter, optionalAuthenticate, checkPromo);

// Bosh sahifa "Aksiyalar" bo'limi uchun — faol promo-kodlar (autentifikatsiyasiz).
router.get('/public', getPublicPromos);

// User: o'z shaxsiy/yaroqli promo-kodlari
router.get('/me', authenticate, getMyPromosUser);

// Admin boshqaruvi
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getMyPromos);
router.post('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), createPromo);
router.patch('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updatePromo);
router.delete('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deletePromo);

export default router;