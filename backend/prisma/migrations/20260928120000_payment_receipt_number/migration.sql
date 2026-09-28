-- CHEK (RECEIPT) RAQAMI
--
-- Nima uchun: mijoz bank/to'lov ilovasida to'lagandan keyin chekni yuboradi.
-- UUID (32 belgi) telefon orqali aytib bo'lmaydi va admin bank hisobida
-- izlashga qiynaladi. Shuning uchun har bir to'lovga inson o'qiydigan qisqa
-- unikal raqam beriladi: "CZ-7K2M9QX4".
--
--  - mijoz: chek raqamini ko'radi, bank ilovasida to'lov izohiga yozadi
--  - admin: shu raqam (yoki karta oxirgi 4 raqam + ism) bo'yicha to'lovni topadi
--
-- Idempotent: ADD COLUMN IF NOT EXISTS — mavcut prod bazada ham xatosiz.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "receipt_number" TEXT;

-- UNIQUE sharti alohida qo'shiladi: mavcut bazada `NULL` qiymatlar bo'lsa
-- ham CREATE UNIQUE INDEX xatosiz o'tadi (Postgres NULL'ni NULL deb hisoblamaydi).
CREATE UNIQUE INDEX IF NOT EXISTS "payments_receipt_number_key"
  ON "payments" ("receipt_number");

-- "Chek kutilmoqda" ro'yxatini tezlashtirish (admin bo'limi).
CREATE INDEX IF NOT EXISTS "payments_receipt_proof_idx"
  ON "payments" ("receipt_number", "proof_submitted_at");
