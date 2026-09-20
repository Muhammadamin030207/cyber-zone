import { Router } from 'express';
import {
  sendSupport,
  getSupportMessages,
  getSupportThreads,
  getMySupportRooms,
  clearSupportThread,
  editSupportMessage,
  deleteSupportMessage,
} from '../controllers/support.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Xabar yuborish / thread tarixi
router.post('/messages', authenticate, sendSupport);
router.get('/messages', authenticate, getSupportMessages);

// Bitta xabarni tahrirlash / o'chirish (muallif | ADMIN | SUPER_ADMIN)
router.patch('/messages/:id', authenticate, editSupportMessage);
router.delete('/messages/:id', authenticate, deleteSupportMessage);

// USER: admin kanali uchun xona ro'yxati
router.get('/my-rooms', authenticate, getMySupportRooms);

// ADMIN/SUPER_ADMIN: murojaatlar ro'yxati va tozalash
router.get('/threads', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), getSupportThreads);
router.delete('/threads/:userId', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), clearSupportThread);

export default router;