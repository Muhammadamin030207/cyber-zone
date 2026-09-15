import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import authRoutes from './routes/auth.routes';
import { errorHandler, notFound } from './middlewares/error';

const app = express();
const httpServer = createServer(app);

// Socket.io — real vaqt yangilanishlar
const io = new Server(httpServer, {
  cors: {
    origin: config.frontendUrl,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('[SOCKET] Connected:', socket.id);
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

app.use('/api/auth', authRoutes);

// 404 va error handler
app.use(notFound);
app.use(errorHandler);

httpServer.listen(config.port, () => {
  console.log(`🚀 Cyber-ZONE API ${config.port}-portda ishlamoqda`);
  console.log(`   Frontend: ${config.frontendUrl}`);
});

export { io };