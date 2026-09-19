import { Router } from 'express';
import {
  sendSupport,
  getSupportMessages,
  getSupportThreads,
  clearSupportThread,
} from '../controllers/support.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Foydalanuvchi/Admin: super_admin'ga yozish, o'z thread'i
router.post('/messages', authenticate, sendSupport);
router.get('/messages', authenticate, getSupportMessages);

// SUPER_ADMIN: barcha murojaatlar
router.get('/threads', authenticate, authorize('SUPER_ADMIN'), getSupportThreads);
router.delete('/threads/:userId', authenticate, authorize('SUPER_ADMIN'), clearSupportThread);

export default router;