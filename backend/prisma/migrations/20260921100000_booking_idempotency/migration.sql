-- Idempotentlik: bron yaratish takroriy so'rovlardan himoya qilish.
-- Foydalanuvchi bo'yicha unique idempotency_key — ikkinchi marta bosish yangi
-- bron yaratmaydi.
ALTER TABLE "bookings" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "bookings_userId_idempotencyKey_key" ON "bookings"("user_id", "idempotency_key");