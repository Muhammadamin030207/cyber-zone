import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000'),
  databaseUrl: process.env.DATABASE_URL!,
  jwt: {
    secret: process.env.JWT_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpires: process.env.ACCESS_TOKEN_EXPIRES || '15m',
    refreshExpires: process.env.REFRESH_TOKEN_EXPIRES || '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
  frontendUrls: (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3006')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    secure: process.env.EMAIL_USE_TLS === 'true' || process.env.EMAIL_SECURE === 'true',
    from: process.env.DEFAULT_FROM_EMAIL || '',
    // Asosiy SMTP portga ulanib bo'lmasa (masalan Render free SMTP portlarini
    // bloklaydi), shu portlar ketma-ket sinaladi. Brevo 2525'ni qo'llab-quvvatlaydi.
    fallbackPorts: (process.env.EMAIL_FALLBACK_PORTS || '2525')
      .split(',')
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => Number.isFinite(v) && v > 0),
  },
  bookings: {
    // To'lanmagan bronni avtomatik bekor qilish muddati (daqiqa). Abandoned
    // PENDING/PENDING_PAYMENT bronlar vaqt oralig'ini qulflab qoymasligi uchun.
    unpaidTtlMinutes: Math.max(5, parseInt(process.env.UNPAID_BOOKING_TTL_MINUTES || '60', 10)),
  },
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6380',
  payments: {
    minDepositPercent: Math.min(100, Math.max(1, parseInt(process.env.MIN_DEPOSIT_PERCENT || '10', 10))),
    callbackBaseUrl: process.env.PROVIDER_CALLBACK_URL || '',
    click: {
      serviceId: process.env.CLICK_SERVICE_ID || '',
      merchantId: process.env.CLICK_MERCHANT_ID || '',
      merchantUserId: process.env.CLICK_MERCHANT_USER_ID || '',
      secretKey: process.env.CLICK_SECRET_KEY || '',
      endpoint: process.env.CLICK_CHECKOUT_URL || 'https://my.click.uz/services/pay',
    },
    payme: {
      merchantId: process.env.PAYME_MERCHANT_ID || '',
      merchantKey: process.env.PAYME_MERCHANT_KEY || '',
      checkoutUrl: process.env.PAYME_CHECKOUT_URL || 'https://checkout.payme.uz',
      apiEndpoint: process.env.PAYME_API_ENDPOINT || 'https://checkout.payme.uz',
    },
    uzum: {
      merchantId: process.env.UZUM_MERCHANT_ID || '',
      secretKey: process.env.UZUM_SECRET_KEY || '',
      checkoutUrl: process.env.UZUM_CHECKOUT_URL || 'https://checkout.uzum.uz',
    },
    paynet: {
      merchantId: process.env.PAYNET_MERCHANT_ID || '',
      password: process.env.PAYNET_PASSWORD || '',
      checkoutUrl: process.env.PAYNET_CHECKOUT_URL || '',
      apiEndpoint: process.env.PAYNET_API_ENDPOINT || '',
    },
  },
  security: {
    // Login brute-force himoyasi: hisob bo'yicha ketma-ket xato urinishlar soni
    // va progressiv blok muddatlari (daqiqa): 1-soat -> 2-soat -> 5-soat -> 24-soat.
    // Oxirgi qiymat keyingi barcha bloklar uchun qoladi. Env orqali sozlanadi
    // (hardcode emas). Bu GLOBAL emas — faqat shu hisobga tegishli.
    loginMaxAttempts: Math.max(1, parseInt(process.env.LOGIN_MAX_ATTEMPTS || '10', 10)),
    loginLockMinutes: (process.env.LOGIN_LOCK_MINUTES || '60,120,300,1440')
      .split(',')
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => Number.isFinite(v) && v > 0),
  },
  webauthn: {
    // WebAuthn/Passkey sozlamalari. rpID — passkey bog'langan domain (production:
    // frontend domain). expectedOrigins — CORS bilan mos.
    rpName: process.env.WEBAUTHN_RP_NAME || 'Cyber-ZONE',
    rpID:
      process.env.WEBAUTHN_RP_ID ||
      (() => {
        const firstUrl = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3006')
          .split(',')[0]
          .trim();
        return new URL(firstUrl).hostname;
      })(),
    expectedOrigins: (process.env.WEBAUTHN_EXPECTED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    tempPasswordMinutes: Math.max(10, parseInt(process.env.TEMP_PASSWORD_MINUTES || '30', 10)),
  },
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000', 10),
  },
};