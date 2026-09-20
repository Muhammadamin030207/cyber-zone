import { Router } from 'express';
import { chat } from '../controllers/ai.controller';
import rateLimit from 'express-rate-limit';

const router = Router();

/**
 * POST /api/ai/chat
 * AI yordamchi — { message }
 * Gemini API xarajatini cheklash uchun alohida rate-limit qo'llanadi.
 */
router.post(
  '/chat',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    standardHeaders: false,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: { success: false, message: 'Juda ko\'p so\'rov yuborildi. Bir daqiqadan so\'ng qayta urinib ko\'ring.' },
  }),
  chat
);

export default router;