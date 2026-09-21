// E2E test muhiti — har qanday import'dan OLDIN ishlaydi.
// Bu yerda o'rnatilgan env'lar .env tomonidan QAYTA yozilmaydi (dotenv override qilmaydi).
process.env.NODE_ENV = 'test';

// Alohida E2E ma'lumotlar bazasi (prod/dev DB'ga TEGMAYDI).
process.env.DATABASE_URL =
  process.env.E2E_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/cyber_zone_e2e?schema=public';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret';

// Tarmoqqa chiqmaydigan deterministik AI (fallback javob ishlatiladi).
process.env.GEMINI_API_KEY = '';

// Email yuborilmasin (SMTP sozlanmagan -> console fallback).
process.env.EMAIL_HOST = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';

// To'lov webhook testlari uchun Payme kredensiallari (test qiymatlar).
process.env.PAYME_MERCHANT_ID = 'e2e_payme_merchant';
process.env.PAYME_MERCHANT_KEY = 'e2e_payme_key';
process.env.PAYME_API_ENDPOINT = 'http://127.0.0.1:9/payme';
process.env.PROVIDER_CALLBACK_URL = 'http://localhost:5000';

process.env.FRONTEND_URLS = 'http://localhost:3006';
process.env.WEBAUTHN_RP_ID = 'localhost';
process.env.WEBAUTHN_EXPECTED_ORIGINS = 'http://localhost:3006';
