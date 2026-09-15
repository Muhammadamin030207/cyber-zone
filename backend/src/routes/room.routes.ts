import { Router } from 'express';
import {
  getRooms,
  getNearbyRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomStats,
} from '../controllers/room.controller';
import { getZones, createZone, updateZone, deleteZone } from '../controllers/zone.controller';
import { createComputer, updateComputer, updateComputerStatus, deleteComputer, getComputersByZone } from '../controllers/computer.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// ============ XONALAR ============
router.get('/', getRooms);
router.get('/nearby', getNearbyRooms);
router.get('/:id', getRoomById);
router.get('/:id/stats', authenticate, getRoomStats);

router.post('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), createRoom);
router.put('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateRoom);
router.delete('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deleteRoom);

// ============ ZONALAR ============
router.get('/:roomId/zones', getZones);
router.post('/:roomId/zones', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), createZone);
router.put('/:roomId/zones/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateZone);
router.delete('/:roomId/zones/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deleteZone);

// ============ KOMPYUTERLAR ============
router.get('/:roomId/zones/:zoneId/computers', getComputersByZone);
router.post('/:roomId/zones/:zoneId/computers', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), createComputer);
router.put('/:roomId/zones/:zoneId/computers/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateComputer);
router.patch('/:roomId/zones/:zoneId/computers/:id/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), updateComputerStatus);
router.delete('/:roomId/zones/:zoneId/computers/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deleteComputer);

export default router;