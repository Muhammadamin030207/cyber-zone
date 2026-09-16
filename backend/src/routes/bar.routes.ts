import { Router } from 'express';
import {
  getBarItems,
  getBarItemsAll,
  createBarItem,
  updateBarItem,
  deleteBarItem,
  createBarOrder,
  getMyBarOrders,
  getRoomBarOrders,
  updateBarOrderStatus,
} from '../controllers/bar.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// PUBLIK (menyu)
router.get('/rooms/:roomId/items', getBarItems);

// ADMIN (menyu boshqaruvi)
router.get('/items/all', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getBarItemsAll);
router.post('/items', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), createBarItem);
router.patch('/items/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateBarItem);
router.delete('/items/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deleteBarItem);

// USER (buyurtmalar)
router.post('/orders', authenticate, authorize('USER', 'ADMIN', 'SUPER_ADMIN'), createBarOrder);
router.get('/orders/my', authenticate, getMyBarOrders);

// ADMIN (buyurtmalarni boshqarish)
router.get('/admin/orders', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getRoomBarOrders);
router.patch('/admin/orders/:id/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateBarOrderStatus);

export default router;