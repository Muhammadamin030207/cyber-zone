import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middlewares/auth';
import {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  deleteConversation,
  sendMessage,
  editMessage,
  deleteMessage,
  regenerateMessage,
} from '../controllers/aiConversations.controller';

const router = Router();
router.use(authenticate);

// AI xarajat himoyasi: chat spam — 30 ta xabar / 15 daqiqa / IP
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p so'rov. Birozdan so'ng qayta urinib ko'ring." },
});

// Conversations
router.get('/conversations', listConversations);
router.post('/conversations', aiLimiter, createConversation);
router.get('/conversations/:id', getConversation);
router.patch('/conversations/:id', renameConversation);
router.delete('/conversations/:id', deleteConversation);

// Messages
router.post('/conversations/:id/messages', aiLimiter, sendMessage);
router.patch('/messages/:id', aiLimiter, editMessage);
router.delete('/messages/:id', deleteMessage);
router.post('/messages/:id/regenerate', aiLimiter, regenerateMessage);

export default router;