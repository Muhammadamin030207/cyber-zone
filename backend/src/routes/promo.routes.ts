import { Router } from 'express';
import {
  getMyPromos,
  createPromo,
  updatePromo,
  deletePromo,
  checkPromo,
  getMyPromosUser,
} from '../controllers/promo.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Public: kodni tekshirish
router.get('/check', checkPromo);

// User: o'z shaxsiy/yaroqli promo-kodlari
router.get('/me', authenticate, getMyPromosUser);

// Admin boshqaruvi
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getMyPromos);
router.post('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), createPromo);
router.patch('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updatePromo);
router.delete('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deletePromo);

export default router;