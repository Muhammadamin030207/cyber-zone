import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from './config';
import authRoutes from './routes/auth.routes';
import roomRoutes from './routes/room.routes';
import bookingRoutes from './routes/booking.routes';
import promoRoutes from './routes/promo.routes';
import paymentRoutes from './routes/payment.routes';
import newsRoutes from './routes/news.routes';
import userRoutes from './routes/user.routes';
import aiRoutes from './routes/ai.routes';
import { errorHandler, notFound } from './middlewares/error';
import prisma from './lib/prisma';
import { io } from './lib/socket';
import { redisClient } from './lib/redis';

const app = express();
const httpServer = createServer(app);

// Socket.io — http serverga biriktirish
io.attach(httpServer);

io.on('connection', (socket) => {
  console.log('[SOCKET] Connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('[SOCKET] Disconnected:', socket.id);
  });
});

// Redis alohida bog'lanish (caching uchun)
redisClient.connect().catch((e) => console.warn('[REDIS]', e.message));

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrls,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API himoyasi — rate limit (IP bo'yicha)
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Ko\'p so\'rov yuborildi. Birmuncha kuting.' },
  })
);

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
    let redisStatus = 'disconnected';
    try {
      redisStatus = redisClient.status === 'ready' ? 'connected' : 'disconnected';
    } catch {
      /* ignore */
    }
    res.json({
      status: 'ok',
      db: 'connected',
      redis: redisStatus,
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
app.use('/api/ai', aiRoutes);

// 404 va error handler
app.use(notFound);
app.use(errorHandler);

httpServer.listen(config.port, () => {
  console.log(`🚀 Cyber-ZONE API ${config.port}-portda ishlamoqda`);
  console.log(`   Frontendlar: ${config.frontendUrls.join(', ')}`);
});