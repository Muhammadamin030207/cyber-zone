import { Router } from 'express';
import { chat, chatStream } from '../controllers/ai.controller';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middlewares/auth';

const router = Router();

/**
 * POST /api/ai/chat
 * AI yordamchi — { message, history? } (authenticated)
 * Gemini/Claude API xarajatini cheklash uchun alohida rate-limit qo'llanadi.
 * Faqat autentifikatsiyadan o'tgan foydalanuvchilar (o'z bron/to'lov ma'lumotlari bilan).
 */
const aiRate = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { success: false, message: 'Juda ko\'p so\'rov yuborildi. Bir daqiqadan so\'ng qayta urinib ko\'ring.' },
});

router.post('/chat', authenticate, aiRate, chat);
router.post('/chat/stream', authenticate, aiRate, chatStream);

export default router;