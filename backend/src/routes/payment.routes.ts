import { Router } from 'express';
import {
  createPayment,
  getPaymentStatus,
  confirmPayment,
  getAllPayments,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.post('/create', authenticate, authorize('USER', 'ADMIN', 'SUPER_ADMIN'), createPayment);
router.get('/:bookingId', authenticate, getPaymentStatus);
router.post('/:id/confirm', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), confirmPayment);

// Super admin barcha to'lovlar
router.get('/', authenticate, authorize('SUPER_ADMIN'), getAllPayments);

export default router;