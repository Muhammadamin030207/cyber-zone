import { Router } from 'express';
import { register, login, googleLogin, refreshToken, getMe, updateProfile, changePassword, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

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
router.post('/login', login);

/**
 * POST /api/auth/login/google
 */
router.post('/login/google', googleLogin);

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', refreshToken);

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, getMe);

/**
 * PUT /api/auth/profile
 */
router.put('/profile', authenticate, updateProfile);

/**
 * PUT /api/auth/change-password
 */
router.put('/change-password', authenticate, changePassword);

/**
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', forgotPassword);

/**
 * POST /api/auth/reset-password
 */
router.post('/reset-password', resetPassword);

export default router;