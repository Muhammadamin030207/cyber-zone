-- IKKILIK (COMPOSITE) INDEKSLAR — so'rov yo'llariga moslash
--
-- Maqsad: mavjud indekslar bitta ustunga qaragan, lekin real so'rovlar
-- IKKALA ustun bo'yicha filtrlaydi. Postgres bitta-ustunli indeksdan ikkala
-- shartni ham qamrab olmaydi — har so'rov seq scan yoki filtr chiqib ketadi.
--
-- 1) support_messages (user_id, is_read)
--    O'qilmagan xabarlar soni shu filtr bilan olinadi:
--    `{ userId, isRead: false, senderId: { not } }` (chat.controller.ts).
--    ChatMessage va Notification da shu indeks allaqachon bor; SupportMessage
--    — yetishmaydigan yagona model edi.
--
-- 2) bar_orders (room_id, created_at)
--    Xona admini buyurtmalarni shu filtr + `orderBy createdAt` bilan oladi
--    (bar.controller.ts `getBarOrders`). Hozir faqat (user_id, created_at) bor.
--
-- XAVFSIZ: FAQAT indeks qo'shiladi — hech qanday jadval/ustun/o'q
-- o'zgartirilmaydi, ma'lumotga tegilmaydi. `IF NOT EXISTS` bilan
-- xatosiz/idempotent.

CREATE INDEX IF NOT EXISTS "support_messages_user_id_is_read_idx"
  ON "support_messages" ("user_id", "is_read");

CREATE INDEX IF NOT EXISTS "bar_orders_room_id_created_at_idx"
  ON "bar_orders" ("room_id", "created_at");
