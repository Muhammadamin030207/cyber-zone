-- Boshlang'ich FAQ — admin panel orqali tahrirlanadi (§6.16). Agar admin allaqachon
-- qiymat kiritgan bo'lsa, SEED yozilmaydi (key bo'yicha tekshiriladi).
INSERT INTO "site_settings" (id, key, value, updated_at)
SELECT
  'seed_faq',
  'faq',
  E'To''lov qanday amalga oshiriladi? — Bron 30% oldindan to''lanadi (kassada yoki checkout sahifasidagi mavjud onlayn usullar orqali), qolgan 70% bron vaqtida to''lanadi.\nBronni qanday bekor qilish? — Profil > Bronlar bo''limi yoki admin/super admin''ga murojaat qiling.\nBonus ballar qanday ishlaydi? — Har to''lovdan bonus ballar yig''iladi (1 ball = 1 so''m), keyingi bronlarda ishlatish mumkin.\nParol unutildi? — Login sahifasida "Parolni unutdingizmi" tugmasi orqali email''ga tiklash havolasi yuboriladi.\nSuhbat qayerda? — Xonalar chat (har bir xona), Admin bilan shaxsiy yozishma va Super Admin support mavjud.',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "site_settings" WHERE key = 'faq');