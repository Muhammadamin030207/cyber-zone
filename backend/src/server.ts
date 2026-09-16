import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { config } from './config';
import authRoutes from './routes/auth.routes';
import roomRoutes from './routes/room.routes';
import bookingRoutes from './routes/booking.routes';
import promoRoutes from './routes/promo.routes';
import paymentRoutes from './routes/payment.routes';
import newsRoutes from './routes/news.routes';
import userRoutes from './routes/user.routes';
import notificationRoutes from './routes/notification.routes';
import barRoutes from './routes/bar.routes';
import chatRoutes from './routes/chat.routes';
import { errorHandler, notFound } from './middlewares/error';
import prisma from './lib/prisma';
import { io } from './lib/socket';

const app = express();
const httpServer = createServer(app);

// Socket.io — http serverga biriktirish
io.attach(httpServer);

io.on('connection', (socket) => {
  console.log('[SOCKET] Connected:', socket.id);

  // User o'z xonasiga ulansin (faqat o'ziga tegishli xabarlarni olish uchun)
  const userId = (socket.handshake.query as any).userId as string | undefined;
  if (userId) socket.join(`user:${userId}`);

  socket.on('register', (id: string) => {
    if (id) socket.join(`user:${id}`);
  });

  // Chat: xona chatlariga qo'shilish (jonli yangilanish uchun)
  socket.on('joinRoom', (roomId: string) => {
    if (roomId) socket.join(`chat:room:${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] Disconnected:', socket.id);
  });
});

// Middlewares
app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request log (dev)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/', (_req, res) => {
  res.json({
    name: 'Cyber-ZONE API',
    version: '1.0.0',
    status: 'running',
  });
});

// ============ HEALTH CHECK ============
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      db: 'connected',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: (err as Error).message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/bar', barRoutes);
app.use('/api/chat', chatRoutes);

// 404 va error handler
app.use(notFound);
app.use(errorHandler);

httpServer.listen(config.port, () => {
  console.log(`🚀 Cyber-ZONE API ${config.port}-portda ishlamoqda`);
  console.log(`   Frontend: ${config.frontendUrl}`);
});