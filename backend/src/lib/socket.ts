import { Server } from 'socket.io';
import { config } from '../config';

// Socket.io server — alohida modul (circular import oldini olish uchun)
export const io = new Server({
  cors: {
    origin: config.frontendUrl,
    credentials: true,
  },
});