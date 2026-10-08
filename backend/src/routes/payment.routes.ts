import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createRedisRateLimiter } from '../lib/redis';
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
  getMerchantCard,
  getMerchantCards,
  submitTransferProof,
  rejectTransferPayment,
  getDebts,
  settleDebt,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { uploadPaymentReceipts } from '../middlewares/upload';

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

// Sandbox mock — `authenticate` QO'YILMAYDI (URL brauzerda ochiladi, header
// yo'q). Himoya: runtime sandbox guard + `mock_key` + spam limiter.
const mockLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: any) => req.ip || 'unknown',
  message: { success: false, message: 'Juda ko\'p sandbox so\'rov' },
});

// Sandbox mock gateway — maxsus `mock_key` bilan ochiladi (URL'da).
// `authenticate` QO'YILMAYDI: bu URL brauzer orqali ochiladi (redirect),
// ya'ni Authorization header yo'q. Himoya quyidagilarda:
//   1) runtime `paymentsSandbox()` — production'da butunlay fail-closed (404)
//   2) `mock_key` — server'dagi maxfiy kalit URL'siz ishlamaydi
//   3) `mockLimiter` — spam cheklovi
//   4) ichki webhook o'z imzosi bilan yuboriladi — "soxta PAID" imkonsiz
router.get('/mock/:provider', mockLimiter, mockSandboxPayment);

/**
 * To'lov yaratish (spec §4.0): moliyaviy amal. Global limit (120/min) yetarli
 * emas — authenticated foydalanuvchi bir necha sekundda yuzlab "create"
 * yuborib booking/DB yukini oshirishi mumkin. Kalit — IP + foydalanuvchi.
 */
const paymentCreateLimiter = createRedisRateLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyPrefix: 'rl:payment:create',
  keyGenerator: (req: any) => `${req.ip || 'unknown'}:${req.user?.userId || 'anon'}`,
  message: { success: false, message: "Juda ko'p to'lov so'rovi. Birozdan so'ng qayta urinib ko'ring." },
});

/**
 * To'lovni tasdiqlash — eng zaif nuqta: noto'g'ri holatni "PAID"ga o'tkazish
 * mumkin bo'lgan endpoint. ADMIN/SUPER_ADMIN uchun ham keng limit kerak
 * (legit admin tez-tez ishlaydi), lekin himoyalangan.
 */
const paymentConfirmLimiter = createRedisRateLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  keyPrefix: 'rl:payment:confirm',
  keyGenerator: (req: any) => `${req.ip || 'unknown'}:${req.user?.userId || 'anon'}`,
  message: { success: false, message: "Juda ko'p tasdiqlash so'rovi. Birozdan so'ng qayta urinib ko'ring." },
});

// O'tkazma tasdig'i yuklash — fayl + DB yozuvi, limitlash kerak.
const proofLimiter = createRedisRateLimiter({
  windowMs: 60 * 1000,
  limit: 5,
  keyPrefix: 'rl:payment:proof',
  keyGenerator: (req: any) => `${req.ip || 'unknown'}:${req.user?.userId || 'anon'}`,
  message: { success: false, message: "Juda ko'p tasdiq so'rovi. Birozdan so'ng qayta urinib ko'ring." },
});

// SUPER_ADMIN: to'lov test (sandbox) rejimi boshqaruvi
router.get('/admin/sandbox', authenticate, authorize('SUPER_ADMIN'), getSandboxState);
router.put('/admin/sandbox', authenticate, authorize('SUPER_ADMIN'), setSandboxState);

router.post('/create', authenticate, authorize('USER', 'ADMIN', 'SUPER_ADMIN'), paymentCreateLimiter, createPayment);
// Dogaon kartasi (nusxalash uchun). AUTENTIFIKATSIYA MAJBURIY — karta raqami
// ommaviy endpointda chiqmasligi kerak (skraper/bo'g'in himoyasi).
router.get('/merchant-card', authenticate, getMerchantCard);
// BARCHA sozlangan kartalar — chekout usullar ro'yxatini shundan quradi.
router.get('/merchant-cards', authenticate, getMerchantCards);

// Kassa: qarzlar (overtime) ro'yxati
router.get('/debts', authenticate, getDebts);

// To'lovchi o'tkazma tasdig'i: oxirgi 4 raqam + ism + 1..3 ta chek
router.post(
  '/:id/proof',
  authenticate,
  authorize('USER', 'ADMIN', 'SUPER_ADMIN'),
  proofLimiter,
  uploadPaymentReceipts.array('receipts', 3),
  submitTransferProof,
);

// ADMIN: kassada to'landi deb tasdiqlash (qarzni yopish)
router.post(
  '/:id/settle',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  paymentConfirmLimiter,
  settleDebt,
);

router.get('/providers', getProviders);
router.get('/history', authenticate, getPaymentHistory);
router.get('/:id/status', authenticate, getPaymentByIdStatus);
router.post('/:id/confirm', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), paymentConfirmLimiter, confirmPayment);
router.post('/:id/reject', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), paymentConfirmLimiter, rejectTransferPayment);
router.get('/:bookingId', authenticate, getPaymentStatus);

// Barcha to'lovlar (platform bo'ylab qidiruv/eksport) — FAQAT SUPER_ADMIN.
// Xona ADMIN'i o'z to'lovlarini `GET /api/payments/debts` ("Kassa" bo'limi)
// orqali ko'radi: u allaqachon `room.ownerId` bo'yicha qat'iy scope'langan.
// Bu ro'yxat esa boshqa xonalarning mijoz ismi/telefoni/cheqini ko'rsatardi,
// shuning uchun ADMIN uchun yopiq.
router.get('/', authenticate, authorize('SUPER_ADMIN'), getAllPayments);

export default router;