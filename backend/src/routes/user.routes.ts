import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  createAdmin,
  toggleUserStatus,
  deleteUser,
  getSuperAdminStats,
  adminResetUserPassword,
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// SUPER_ADMIN boshqaruvi
router.get('/', authenticate, authorize('SUPER_ADMIN'), getAllUsers);
router.get('/stats', authenticate, authorize('SUPER_ADMIN'), getSuperAdminStats);
router.post('/admins', authenticate, authorize('SUPER_ADMIN'), createAdmin);
router.patch('/:id/status', authenticate, authorize('SUPER_ADMIN'), toggleUserStatus);
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), deleteUser);
// Parolni tiklash (email kanaliga bog'liq bo'lmagan zaxira yo'l)
router.post('/:id/reset-password', authenticate, authorize('SUPER_ADMIN'), adminResetUserPassword);
router.get('/:id', authenticate, authorize('SUPER_ADMIN'), getUserById);

export default router;