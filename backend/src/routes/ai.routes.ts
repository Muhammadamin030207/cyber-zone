import { Router } from 'express';
import { chat } from '../controllers/ai.controller';

const router = Router();

/**
 * POST /api/ai/chat
 * AI yordamchi — { message }
 */
router.post('/chat', chat);

export default router;