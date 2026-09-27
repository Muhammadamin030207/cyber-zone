-- ============================================================================
-- Safe ADDITIVE migration — ma'lumot yo'qotilmaydi, hech nima DROP/TRUNCATE
-- qilinmaydi. Faqat indexlar qo'shiladi (Postgres'da CREATE INDEX ... 
-- CONCURRENTLY ishlatilmadi, chunki Prisma migratsiyasi transaction ichida).
--
-- MAQSAD: Phase 3 — high-concurrency / server performance.
-- Har bir index aniq bir QUERY PATTERN ga asoslangan (koddan tekshirilgan):
--
--  1) chat_messages(room_id, created_at)
--     -> chat.controller.ts:34  findMany({ where:{roomId}, orderBy:{createdAt} })
--        Xona chatini ochish — eng ko'p tekrarlanadigan query. Hozir jadval
--        to'liq skan qilinib, keyin saralanardi (filesort).
--  2) chat_messages(user_id, is_read)
--     -> chat.controller.ts:44,86,120  o'qilmagan xabarlar
--  3) notifications(user_id, created_at)
--     -> notification.controller.ts:10  foydalanuvchi bildirishnomalari.
--        Jadval har bir to'lovda o'sadi (payment.controller.ts:449).
--  4) computers(zone_id)
--     -> room.controller.ts:585  computer.count({ where:{ zone:{ roomId } } })
--        FK ustida index yo'q edi -> har bir xona statistikasida seq scan.
--  5) zones(room_id)
--     -> room.controller.ts:585  zone.count({ where:{ roomId } })
--  6) reviews(room_id)
--     -> room.controller.ts:247  review.aggregate({ where:{roomId} }) — O'RTACHA
--        reyting. Xona detail sahifasi HAR BIR ochilishda ishlaydi.
--  7) reviews UNIQUE(user_id, room_id)
--     -> room.controller.ts:543  findFirst({userId, roomId}) — kod "bitta izoh"
--        qoidasini faqat application darajasida tekshiradi (race -> duplikat).
--        DB unique constraint bu qoidani kafolatlaydi.
--  8) bar_items(room_id, is_available)
--     -> bar.controller.ts:11,27,37  xona menyusi
--  9) bar_orders(user_id, created_at)
--     -> bar.controller.ts:180  foydalanuvchi buyurtmalari
-- 10) computer_rooms(status, created_at)
--     -> user.controller.ts:163,169  super-admin statistikasi;
--        room.controller.ts:16  ommaviy xona ro'yxati (orderBy createdAt)
-- 11) users(role) / users(status) / users(created_at)
--     -> user.controller.ts:42,161,162  admin foydalanuvchi ro'yxati va
--        rol bo'yicha count() — jadval eng katta o'sadigan jadval.
--
-- DIQQAT: mavjud indekslar saqlanadi (IF NOT EXISTS) — bu migratsiya
-- qayta ishga tushsa ham xatosiz o'tadi.
-- ============================================================================

-- 1) Xona chat xabarlari — eng issiq, indekssiz query
CREATE INDEX IF NOT EXISTS "chat_messages_room_id_created_at_idx" ON "chat_messages"("room_id", "created_at");

-- 2) O'qilmagan xabarlar
CREATE INDEX IF NOT EXISTS "chat_messages_user_id_is_read_idx" ON "chat_messages"("user_id", "is_read");

-- 3) Bildirishnomalar (to'lovlar soni bilan o'sadi)
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- 4) Kompyuter -> zona FK
CREATE INDEX IF NOT EXISTS "computers_zone_id_idx" ON "computers"("zone_id");

-- 5) Zona -> xona FK
CREATE INDEX IF NOT EXISTS "zones_room_id_idx" ON "zones"("room_id");

-- 6) Xona reytingi (har bir detail so'rovda aggregate)
CREATE INDEX IF NOT EXISTS "reviews_room_id_idx" ON "reviews"("room_id");

-- 7) reviews(user_id, room_id) — NON-UNIQUE
--    -> room.controller.ts:543  findFirst({ userId, roomId }) — "bitta izoh" qoidasi
--       faqat application darajasida tekshiriladi, DB darajasida YO'Q.
--    !! BIRINCHI o'ringa unique constraint qo'yish to'g'ri, lekin u xavfli:
--       agar production'da allaqachon duplikat (user_id, room_id) qatorlari
--       bo'lsa, CREATE UNIQUE INDEX migratsiyani FAIL qiladi -> deploy butunlay
--       to'xtaydi. Ma'lumotni o'zgartirishga ruxsat yo'q (Phase 1 qoidasi), shu
--       uchun bu yerda faqat indeks qo'shiladi, unique emas.
--    ✅ Keyingi bosqich (EGANG RUXSATI bilan):
--       1) production'da duplikatlarni tekshirish:
--            SELECT user_id, room_id, count(*) FROM reviews
--            GROUP BY 1,2 HAVING count(*) > 1;
--       2) duplikat bo'lsa — qaysi biri saqlanishi kerakligini egang hal qiladi
--          (MASALAN: eng so'nggi izoh qoldiriladi, qolganlari o'chiriladi);
--       3) keyin: CREATE UNIQUE INDEX "reviews_user_id_room_id_key" ...
--          (prisma/schema.prisma ga @@unique([userId, roomId]) qo'yiladi)
CREATE INDEX IF NOT EXISTS "reviews_user_id_room_id_idx" ON "reviews"("user_id", "room_id");

-- 8) Xona menyusi
CREATE INDEX IF NOT EXISTS "bar_items_room_id_is_available_idx" ON "bar_items"("room_id", "is_available");

-- 9) Foydalanuvchi buyurtmalari
CREATE INDEX IF NOT EXISTS "bar_orders_user_id_created_at_idx" ON "bar_orders"("user_id", "created_at");

-- 10) Xona ro'yxati (status + vaqt bo'yicha saralash)
CREATE INDEX IF NOT EXISTS "computer_rooms_status_created_at_idx" ON "computer_rooms"("status", "created_at");

-- 11) Foydalanuvchilar: rol/status bo'yicha filter va count
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users"("role");
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users"("status");
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users"("created_at");
