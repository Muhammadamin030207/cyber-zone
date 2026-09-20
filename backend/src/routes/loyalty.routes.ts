import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { getMyLoyalty } from '../controllers/loyalty.controller';

const router = Router();

router.get('/me', authenticate, authorize('USER'), getMyLoyalty);

export default router;