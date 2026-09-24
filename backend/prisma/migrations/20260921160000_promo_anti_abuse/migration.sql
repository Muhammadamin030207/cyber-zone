-- PHASE 5: Promo-kod anti-abuse
-- 
-- 1) Mavjud ma'lumotlarni tozalash (non-destructive): agar bir foydalanuvchi
--    bir promo'ni bir nechta FAOL bookingda ishlatgan bo'lsa, faqat eng
--    birinchisi promo'ni saqlab qoladi. Bronning o'zi buzilmaydi — faqat
--    keyingi bronlardagi promo havolasi tozalanadi (discountAmount saqlanadi).
UPDATE "bookings" b
SET "promo_code_id" = NULL
WHERE "status" <> 'CANCELLED'::"BookingStatus"
  AND "promo_code_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "bookings" b2
    WHERE b2."user_id" = b."user_id"
      AND b2."promo_code_id" = b."promo_code_id"
      AND b2."status" <> 'CANCELLED'::"BookingStatus"
      AND b2."created_at" < b."created_at"
  );

-- 2) Race-safe single-use (TOCTOU oldini olish): bitta (user, promo) juftligi
--    faqat bitta FAOL bookingda bo'lishi mumkin. Ikki parallel so'rov bir-birini
--    "ko'rmay" qolib promo'ni qayta ishlata olmaydi. CANCELLED bromlar uchun
--    qayta ishlatish mumkin (avvalgi 'usedCount decrement' mantiqi bilan mos).
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_promo_single_use_active"
ON "bookings" ("user_id", "promo_code_id")
WHERE "promo_code_id" IS NOT NULL AND "status" <> 'CANCELLED'::"BookingStatus";