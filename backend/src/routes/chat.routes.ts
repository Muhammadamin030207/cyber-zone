import { Router } from 'express';
import {
  getRoomMessages,
  sendMessage,
  getAdminChatRooms,
  getUserChatRooms,
  getUnreadCount,
  clearRoomChat,
} from '../controllers/chat.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// USER + ADMIN: chat tarixi va xabar yuborish
router.get('/rooms/:roomId/messages', authenticate, getRoomMessages);
router.post('/rooms/:roomId/messages', authenticate, sendMessage);

// Header badge uchun umumiy o'qilmaganlar soni
router.get('/unread', authenticate, getUnreadCount);

// ADMIN: barcha chatlar ro'yxati
router.get('/admin/rooms', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getAdminChatRooms);

// USER: o'zi ishtirok etgan chatlar
router.get('/user/rooms', authenticate, getUserChatRooms);

// ADMIN / SUPER_ADMIN: suhbatni tozalash
router.delete('/rooms/:roomId/clear', authenticate, clearRoomChat);

export default router;