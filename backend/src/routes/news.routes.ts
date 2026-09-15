import { Router } from 'express';
import { getNews, getRoomNews, createNews, updateNews, deleteNews } from '../controllers/news.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.get('/', getNews);
router.get('/room/:roomId', getRoomNews);

router.post('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), createNews);
router.put('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateNews);
router.delete('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deleteNews);

export default router;