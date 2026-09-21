import { Router } from 'express';
import {
  createPayment,
  getPaymentStatus,
  confirmPayment,
  getAllPayments,
  getProviders,
  getPaymentByIdStatus,
  webhookPayment,
  getPaymentHistory,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Provider webhook (provayder chaqiradi — authsiz, ammo provider-specific validatsiya)
router.post('/webhook/:provider', webhookPayment);

router.post('/create', authenticate, authorize('USER', 'ADMIN', 'SUPER_ADMIN'), createPayment);
router.get('/providers', getProviders);
router.get('/history', authenticate, getPaymentHistory);
router.get('/:id/status', authenticate, getPaymentByIdStatus);
router.post('/:id/confirm', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), confirmPayment);
router.get('/:bookingId', authenticate, getPaymentStatus);

// Super admin barcha to'lovlar
router.get('/', authenticate, authorize('SUPER_ADMIN'), getAllPayments);

export default router;