import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';
import { config } from './config';
import { execSync } from 'child_process';
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
import aiRoutes from './routes/ai.routes';
import aiConversationsRoutes from './routes/aiConversations.routes';
import webauthnRoutes from './routes/webauthn.routes';
import supportRoutes from './routes/support.routes';
import loyaltyRoutes from './routes/loyalty.routes';
import settingsRoutes from './routes/settings.routes';
import { errorHandler, notFound } from './middlewares/error';
import { requestContext } from './middlewares/requestContext';
import prisma, { disconnectPrisma } from './lib/prisma';
import { verifyAccessToken } from './lib/jwt';
import { io, configureSocketAdapter } from './lib/socket';
import { redisClient } from './lib/redis';
import { scheduleBookingWorker } from './utils/bookingWorker';
import { setSandboxForced } from './config/paymentsRuntime';
import { totpKeyHealthy, isJwtSecretHealthy, isEmailConfigured } from './config/securityCheck';
import { isProduction, isNonProduction } from './config/runtime';

const app = express();
const httpServer = createServer(app);

// ============ DB MIGRATIONS ============
// MUHIM: migratsiya — DEPLOY QADAMI, ilova boot'ining yon ta'siri EMAS.
// Ilova ishga tushganda `DROP`/`ALTER` ishga tushirish xavfli: agar migratsiya
// muvaffaqiyatsiz bo'lsa, yangi release'ga DB mos kelmaydi.
//
// Oldingi kod: `isProduction() && !SKIP_MIGRATE_ON_BOOT` — ya'ni migratsiya
// "NODE_ENV yo'q" bo'lsa ham production hisoblanib ICHKI ochilardi. Bu
// bejiz xavf edi (Render'da preDeployCommand faqat PAID planda ishlaydi).
//
// Endi migratsiya faqat ANIQ so'raladi:
//   MIGRATE_ON_BOOT=true            -> shu renderda boot'da bajariladi
//   SKIP_MIGRATE_ON_BOOT=true       -> hech qachon bajarilmaydi
//   (ikkalasi ham yo'q)             -> bajarilMAYDI, lekin ogohlantiriladi
// Tavsiya: Render -> Starter reja + `preDeployCommand: npx prisma migrate deploy`.
// Free planda esa `MIGRATE_ON_BOOT=true` qo'yish kerak.
const MIGRATE_ON_BOOT = process.env.MIGRATE_ON_BOOT === 'true';
const SKIP_MIGRATE_ON_BOOT = process.env.SKIP_MIGRATE_ON_BOOT === 'true';

if (MIGRATE_ON_BOOT && !SKIP_MIGRATE_ON_BOOT) {
  try {
    execSync('npm run prisma:migrate:deploy', { stdio: 'inherit', cwd: process.cwd() });
    console.log('[DB] Migratsiyalar qo\'llandi.');
  } catch (err) {
    // Xato o'ldirmaydi: ilova eski sxema bilan ishlashda davom etadi, lekin
    // jimgina qolmasligi uchun JUDA baland ogohlantirish beriladi.
    console.error('[DB] ⚠️ `prisma migrate deploy` muvaffaqiyatsiz:', (err as Error).message);
    console.error('[DB] ⚠️ Bu release sxemadan qoldi bo\'lishi mumkin — yangi ustun/indexlar ishlamaydi.');
  }
} else if (isProduction()) {
  console.warn(
    '[DB] ⚠️ Boot\'da migratsiya bajarilmaydi (MIGRATE_ON_BOOT/SKIP_MIGRATE_ON_BOOT belgilanmagan). ' +
      'Render Starter rejada `preDeployCommand: npx prisma migrate deploy` ishlaydi; ' +
      'Free rejada esa MIGRATE_ON_BOOT=true qo\'ying.',
  );
}

// Socket.io — http serverga biriktirish
io.attach(httpServer);

io.on('connection', (socket) => {
  // Xavfsizlik: faqat haqiqiy, faol foydalanuvchilar ulanadi.
  const token = (socket.handshake.auth as any)?.token || (socket.handshake.query as any)?.token;
  let decoded: any = null;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    /* ignore */
  }
  if (!decoded) {
    socket.disconnect(true);
    return;
  }
  socket.data.userId = decoded.userId;
  socket.data.role = decoded.role;
  socket.join(`user:${decoded.userId}`);
  console.log('[SOCKET] Connected:', socket.id, decoded.userId);

  socket.on('register', (id: string) => {
    // Faqat o'z xonasiga ulanishi mumkin
    if (id && id === socket.data.userId) socket.join(`user:${id}`);
  });

  // Chat: xona chatlariga qo'shilish (jonli yangilanish uchun)
  // Xavfsizlik: faqat SUPER_ADMIN, xona egasi, yoki shu xonada bron qilgan
  // foydalanuvchi xona chatiga qo'shilishi mumkin (IDOR oldini olish).
  socket.on('joinRoom', async (roomId: string) => {
    if (!roomId || typeof roomId !== 'string') return;
    const role = socket.data.role;
    if (role === 'SUPER_ADMIN') {
      socket.join(`chat:room:${roomId}`);
      return;
    }
    try {
      const room = await prisma.computerRoom.findUnique({ where: { id: roomId }, select: { id: true, ownerId: true } });
      if (!room) return;
      if (role === 'ADMIN') {
        if (room.ownerId === socket.data.userId) socket.join(`chat:room:${roomId}`);
        return;
      }
      const booking = await prisma.booking.findFirst({
        where: { userId: socket.data.userId, roomId: room.id, status: { not: 'CANCELLED' } },
        select: { id: true },
      });
      if (booking) socket.join(`chat:room:${roomId}`);
    } catch {
      /* ignore */
    }
  });

  // Support: super_admin xonasi — faqat adminlar/super admin
  socket.on('joinSupport', () => {
    if (['ADMIN', 'SUPER_ADMIN'].includes(socket.data.role)) socket.join('support:sadmin');
  });

  // Support: alohida thread kuzatuvi (faqat o'z tredini ko'radi; super admin — barchasini)
  socket.on('joinSupportThread', (threadUserId: string, channel?: string) => {
    if (threadUserId && (socket.data.role === 'SUPER_ADMIN' || threadUserId === socket.data.userId)) {
      socket.join(`support:${threadUserId}`);
      socket.join(`support:${channel === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN'}:${threadUserId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] Disconnected:', socket.id);
  });
});

// Redis alohida bog'lanish (caching uchun)
redisClient.connect().catch((e: Error) => console.warn('[REDIS]', e.message));

// Middlewares
// Render/Vercel ortidagi proxy — X-Forwarded-For ni ishonchli deb bilamiz.
// Aks holda barcha foydalanuvchilar bitta proxy IP bilan ko'rinadi va
// global rate-limit butun platformani birga cheklab qo'yadi.
app.set('trust proxy', 1);

// Request ID + REQUEST LOG (spec §42/§60). Auth'dan OLDIN turadi — hatolar
// ham, 404 ham requestId oladi.
app.use(requestContext);

app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrls,
    credentials: true,
  })
);
// Webhook imzolari (Uzum X-Sign HMAC va h.k.) aynan kelgan raw baytlar ustidan
// tekshirilishi uchun request body faylini req.rawBody sifatida saqlaymiz.
const captureRawBody = (req: express.Request, _res: express.Response, buf: Buffer) => {
  (req as any).rawBody = buf;
};
app.use(express.json({ limit: '10mb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, verify: captureRawBody }));

// Yuklangan fayllar (avatar rasmlar) — /uploads osti orqali serv qilinadi
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { maxAge: '7d', immutable: false }));

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
if (isNonProduction()) {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// Routes
app.get('/', (_req, res) => {
  res.json({
    name: 'Cyber-ZONE API',
    version: '1.0.0',
    status: 'running',
  });
});

// ============ BOOT DIAGNOSTIKA ============
// Xavfsizlik kalitlari yo'q bo'lsa butun serverni o'ldirmaymiz (booking/payment
// ishlashda davom etadi), lekin JARRADOR ogohlantiramiz va /api/ready da
// ko'rinadigan qilamiz — aks holda bu xato "jimgina" qolib, 2FA yoqilgan
// foydalanuvchilarni login ekranida qoldirib ketardi (oldingi xato shu edi).
if (!totpKeyHealthy()) {
  console.error(
    '[SECURITY] ⚠️ TOTP_AT_REST_KEY sozlanmagan yoki 32+ belgidan kam. ' +
      '2FA yoqish va TOTP bilan kod tekshirish vaqtinchalik ishlamaydi ' +
      '(backup kodlar ishlaydi). Render -> Environment da `generateValue: true` ' +
      'bilan TOTP_AT_REST_KEY qo\'ying. DIQQAT: mavjud qiymatni ALMASHTIRISH ' +
      'DB dagi shifrlangan 2FA secretlarini buzadi.',
  );
}

if (!isEmailConfigured()) {
  console.error(
    '[SECURITY] SMTP (EMAIL_HOST/EMAIL_USER/EMAIL_PASS/DEFAULT_FROM_EMAIL) sozlanmagan. ' +
      'Parolni unutdingizmi ishlaydi, LEKIN hech qanday email YUBORILMAYDI — ' +
      'foydalanuvchi parolini faqat SUPER_ADMIN orqali tiklaydi.',
  );
}

if (!isJwtSecretHealthy()) {
  console.error(
    '[SECURITY] ⚠️ JWT_SECRET/JWT_REFRESH_SECRET juda qisqa yoki default qiymatda. ' +
      'Render da generateValue: true bilan almashtiring.',
  );
}

// ============ HEALTH CHECK (spec §45) ============
// `/api/health` — liveness: jarayon javob bermoqda (Render healthCheckPath).
// `/api/ready`  — readiness: DB va Redis haqiqatan ishlayaptimi.
// Ikkalasi ham FAQAT holat qaytaradi — hech qanday secret/URL/credential yo'q.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

app.get('/api/ready', async (_req, res) => {
  const checks: Record<string, string> = {};
  let ready = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'unavailable';
    ready = false;
  }

  try {
    checks.redis = redisClient.status === 'ready' ? 'ok' : 'unavailable';
    // Redis majburiy emas (single-instance dev) — readinessni buzmaydi, faqat
    // bildiradi. WebAuthn challenge store esa Redis'siz "fail closed" ishlaydi.
  } catch {
    checks.redis = 'unavailable';
  }

  // Xavfsizlik konfiguratsiyasi holati (kalit QIMMATI EMAS — faqat sog'lom/yo'q).
  // WebAuthn Redis'siz butunlay ishlamaydi, shuning uchun bu holat
  // observability uchun alohida ko'rsatiladi.
  checks.webauthn = checks.redis === 'ok' ? 'ok' : 'unavailable';
  checks.totpEncryption = totpKeyHealthy() ? 'ok' : 'misconfigured';
  checks.email = isEmailConfigured() ? 'ok' : 'not_configured';
  // AI: hech bir provider kaliti yo'q bo'lsa — 'not_configured'. Readinessni
  // BUZMAYDI (sayt ishlaydi), lekin monitoring uchun aniq ko'rinadi.
  const aiProviders = [
    config.ai.anthropicApiKey && 'anthropic',
    config.ai.geminiApiKey && 'gemini',
    config.ai.openaiApiKey && 'openai-compatible',
  ].filter(Boolean);
  checks.ai = aiProviders.length > 0 ? 'ok' : 'not_configured';
  (checks as Record<string, unknown>).aiProviders = aiProviders;
  checks.jwt = isJwtSecretHealthy() ? 'ok' : 'weak';

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
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
app.use('/api/ai', aiRoutes);
app.use('/api/ai', aiConversationsRoutes);
app.use('/api/webauthn', webauthnRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/settings', settingsRoutes);

// 404 va error handler
app.use(notFound);
app.use(errorHandler);

httpServer.listen(config.port, () => {
  console.log(`🚀 Cyber-ZONE API ${config.port}-portda ishlamoqda`);
  console.log(`   Frontendlar: ${config.frontendUrls.join(', ')}`);

  // AI yordamchi holati — "barcha savollarga javob bermadi" degan muammoning
  // eng tez tekshiriladigan sababi kalitning yo'qligi. Render logida ko'rinadi.
  const liveAi = config.ai.anthropicApiKey
    ? `Claude (${config.ai.anthropicModel})`
    : config.ai.geminiApiKey
      ? `Gemini (${config.ai.model})`
      : null;
  if (liveAi) {
    console.log(`   🤖 AI yordamchi: ${liveAi}`);
  } else {
    console.warn(
      '   ⚠️  AI yordamchi KALITSIZ ishlayapti — faqat oddiy qoidalar asosidagi javoblar beriladi.' +
        ' ANTHROPIC_API_KEY yoki GEMINI_API_KEY ni env\'ga qo\'ying (Render dashboard → Environment).'
    );
  }

  // Kengaytirilgan (multi-instance) rejim: Socket.IO xabarlari Redis orqali
  // barcha instansialarga tarqatiladi — bitta serverda chiqish, boshqada
  // bo'sh ko'rinmasligi kafolatlanadi.
  void configureSocketAdapter(io);

  // Bron/sessiya worker: muddati o'tgan "band qilish"larni bo'shatadi va
  // TAYMER TUGAGAN sessiyalarni o'z-o'zidan yopadi (server o'chsa ham
  // qayta ishga tushganda tiklanadi).
  scheduleBookingWorker();
});

// SUPER_ADMIN panel orqali yoqilgan to'lov test rejimini qayta ishga tushirishda tiklaymiz
prisma.siteSetting
  .findUnique({ where: { key: 'payments.sandbox' } })
  .then((row) => {
    setSandboxForced(row?.value === 'on');
  })
  .catch((err) => {
    console.warn('[PAYMENTS] sandbox holatini o\'qib bo\'lmadi:', (err as Error).message);
  });

// ============ GRACEFUL SHUTDOWN (Render deploy / SIGTERM) ============
// Render yangi versiyani deploy qilganda eski instansiyaga SIGTERM yuboradi.
// Agar DB connectionlarni yopmasak, ular Postgres connection limitini
// band qilib, yangi instansiya "too many clients" bilan chiqmay qoladi
// (Render'da bu klassik deploy muammosi). Shu sabab quyidagi ketma-ketlik:
//   1) yangi request'ni qabul qilishni to'xtatamiz
//   2) socketlar uziladi
//   3) DB va Redis connectionlari yopiladi
//   4) jarayon chiqadi
let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // takroriy signalda (SIGTERM + SIGINT) bir marta
  shuttingDown = true;
  console.log(`[shutdown] ${signal} olindi — server to'g'latilmoqda...`);

  // 1) yangi so'rovlarni rad etamiz (health check 503 qaytaradi ->
  //    Render trafficni boshqa instansiyaga ko'chiradi)
  httpServer.close(() => console.log('[shutdown] HTTP server yopildi'));

  // 2) socketlar: mijozlarga "server restart bo'lyapti" deb aytamiz
  try {
    io.emit('server:restarting');
    io.close();
  } catch (err) {
    console.warn('[shutdown] Socket.IO yopilmadi:', (err as Error).message);
  }

  // 3) DB connectionlari
  await disconnectPrisma();

  // 4) qisqa kutish beramiz (Render 10s beradi), keyin chiqamiz
  const timer = setTimeout(() => {
    console.warn('[shutdown] Vaqt tugadi — majburiy chiqilmoqda');
    process.exit(0);
  }, 8000);
  timer.unref();
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// Render'ga xatolik bo'lsa ham, kutilmagan xatolar jarayonni darhal
// o'ldirmasin (health check o'zi hal qiladi) — lekin har doim LOG'lanadi.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Tuzatilmagan promise rad etildi:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Tuzatilmagan exception:', err);
});
