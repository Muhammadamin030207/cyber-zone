-- Brute-force himoyasi: hisob bo'yicha ketma-ket xato urinishlarni kuzatish va
-- vaqtincha bloklash (progressiv: 5 daqiqa -> 30 daqiqa -> 24 soat).
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "login_lock_stage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "login_locked_until" TIMESTAMP(3);
