import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createPayment,
  getPaymentStatus,
  confirmPayment,
  getAllPayments,
  getProviders,
  getPaymentByIdStatus,
  webhookPayment,
  getPaymentHistory,
  mockSandboxPayment,
  getSandboxState,
  setSandboxState,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Webhook spam cheklovi — provider oqimi juda yuqori bo'lsa ham cheklangan
// (imzo validatsiyasi asosiy himoya; bu faqat qo'shimcha qatlam).
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: any) => req.ip || 'unknown',
  message: { success: false, message: 'Juda ko\'p webhook so\'rov' },
});

// Provider webhook (provayder chaqiradi — authsiz, ammo provider-specific validatsiya)
router.post('/webhook/:provider', webhookLimiter, webhookPayment);

// SANDBOX mock gateway — doim mavjud, lekin ishlashi runtime sandbox holatiga
// bog'liq (chaqirilganda tekshiriladi). Real "checkout" sahifasini simulyatsiya
// qilib, imzolangan webhook yuboradi — "soxta PAID" yo'q.
router.get('/mock/:provider', mockSandboxPayment);

// SUPER_ADMIN: to'lov test (sandbox) rejimi boshqaruvi
router.get('/admin/sandbox', authenticate, authorize('SUPER_ADMIN'), getSandboxState);
router.put('/admin/sandbox', authenticate, authorize('SUPER_ADMIN'), setSandboxState);

router.post('/create', authenticate, authorize('USER', 'ADMIN', 'SUPER_ADMIN'), createPayment);
router.get('/providers', getProviders);
router.get('/history', authenticate, getPaymentHistory);
router.get('/:id/status', authenticate, getPaymentByIdStatus);
router.post('/:id/confirm', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), confirmPayment);
router.get('/:bookingId', authenticate, getPaymentStatus);

// Super admin barcha to'lovlar
router.get('/', authenticate, authorize('SUPER_ADMIN'), getAllPayments);

export default router;