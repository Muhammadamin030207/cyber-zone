import { Router } from 'express';
import {
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, getMyNotifications);
router.get('/unread-count', authenticate, getUnreadCount);
router.put('/read-all', authenticate, markAllRead);
router.put('/:id/read', authenticate, markRead);

export default router;