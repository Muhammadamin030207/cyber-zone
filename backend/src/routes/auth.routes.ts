import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, googleLogin, refreshToken, getMe, updateProfile, uploadAvatarImage, changePassword, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { uploadAvatar } from '../middlewares/upload';

const router = Router();

// Brute-force oldini olish: login — 10 ta urinish / 15 daqiqa / IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." },
});

// Forgot-password spam'i: 5 ta so'rov / 15 daqiqa / IP
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p so'rov. Birozdan so'ng qayta urinib ko'ring." },
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Foydalanuvchi ro'yxatdan o'tish
 */
router.post('/register', register);

/**
 * POST /api/auth/login
 */
router.post('/login', loginLimiter, login);

/**
 * POST /api/auth/login/google
 */
router.post('/login/google', loginLimiter, googleLogin);

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', refreshToken);

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, getMe);

/**
 * PUT /api/auth/profile — shaxsiy ma'lumotlar (email immutable)
 */
router.put('/profile', authenticate, updateProfile);

/**
 * POST /api/auth/avatar — avatar rasm yuklash (multipart 'file')
 */
router.post('/avatar', authenticate, uploadAvatar.single('file'), uploadAvatarImage);

/**
 * PUT /api/auth/change-password
 */
router.put('/change-password', authenticate, changePassword);

/**
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', forgotLimiter, forgotPassword);

/**
 * POST /api/auth/reset-password
 */
router.post('/reset-password', resetPassword);

export default router;