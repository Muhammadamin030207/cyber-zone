import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  createAdmin,
  toggleUserStatus,
  deleteUser,
  getSuperAdminStats,
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// SUPER_ADMIN boshqaruvi
router.get('/', authenticate, authorize('SUPER_ADMIN'), getAllUsers);
router.get('/stats', authenticate, authorize('SUPER_ADMIN'), getSuperAdminStats);
router.post('/admins', authenticate, authorize('SUPER_ADMIN'), createAdmin);
router.patch('/:id/status', authenticate, authorize('SUPER_ADMIN'), toggleUserStatus);
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), deleteUser);
router.get('/:id', authenticate, authorize('SUPER_ADMIN'), getUserById);

export default router;