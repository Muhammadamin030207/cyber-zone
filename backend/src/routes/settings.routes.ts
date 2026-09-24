import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getSiteSettings, updateSiteSettings } from '../controllers/settings.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Yozish/so'rov gamproblemasini cheklash (keng IP toifasi — shared NAT xavfsiz)
const settingsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: any) => req.ip || 'unknown',
  message: { success: false, message: 'Juda ko\'p so\'rov. Birozdan so\'ng qayta urinib ko\'ring.' },
});

/**
 * @swagger
 * /api/settings/site:
 *   get:
 *     summary: Sayt bilimlarini o'qish (FAQ, aloqa, to'lov, bekor qilish siyosati) — PUBLIC
 */
router.get('/site', settingsLimiter, getSiteSettings);

/**
 * @swagger
 * /api/settings/site:
 *   put:
 *     summary: Sayt bilimlarini yangilash (§6.16) — faqat ADMIN/SUPER_ADMIN
 */
router.put('/site', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), settingsLimiter, updateSiteSettings);

export default router;