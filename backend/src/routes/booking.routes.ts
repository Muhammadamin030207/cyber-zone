import { Router } from 'express';
import {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  getRoomBookings,
  updateBookingStatus,
  getAvailability,
} from '../controllers/booking.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// ============ AVAILABILITY (public) ============
router.get('/rooms/:roomId/availability', getAvailability);

// ============ USER ============
// Bron faqat USER rolidagi foydalanuvchilarga ruxsat — admin/super_admin bron qilmaydi
router.post('/', authenticate, authorize('USER'), createBooking);
router.get('/', authenticate, getMyBookings);
router.get('/:id', authenticate, getBookingById);
router.put('/:id/cancel', authenticate, cancelBooking);

// ============ ADMIN ============
router.get('/admin/bookings', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), getRoomBookings);
router.patch('/admin/bookings/:id/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateBookingStatus);

export default router;