-- Server-side sessiyani bekor qilish (logout / parol o'zgarishi) uchun token versiyasi
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- TOTP (RFC 6238) ikki faktorli autentifikatsiya
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "two_factor_secret" TEXT;
ALTER TABLE "users" ADD COLUMN "two_factor_confirmed_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "two_factor_backup_codes" JSONB;

-- "Yangi qurilma" aniqlash uchun oxirgi login ma'lumotlari
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "last_login_ip" TEXT;
ALTER TABLE "users" ADD COLUMN "last_login_user_agent" TEXT;
