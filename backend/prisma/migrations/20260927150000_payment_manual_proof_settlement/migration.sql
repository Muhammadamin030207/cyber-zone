-- QO'LDA O'TKAZMA (TRANSFER) TASDIQLOVI + KASSADA TO'LASH
--
-- 1) To'lovchi tasdig'i: faqat karta raqamining OXIRGI 4 raqami + egasi ismi.
--    To'liq karta raqami (PAN) saqlanMAYDI — xavfsizlik/PCI sababi.
-- 2) Qarz (overtime) kassada to'langandan keyin admin tasdiqlaydi:
--    settled_at / settled_by_id — kim, qachon tasdiqlaganini audit qilish uchun.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS — mavcut prod bazada ham xatosiz.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proof_card_last4"      VARCHAR(4);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proof_cardholder_name" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proof_submitted_at"    TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "settled_at"            TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "settled_by_id"         TEXT;

-- Kassa ro'yxati: to'lanmagan qarzlar (is_debt = true, PAID emas)
CREATE INDEX IF NOT EXISTS "payments_debt_open_due_idx"
  ON "payments" ("is_debt", "status", "due_at");

-- Admin tasdig'i (oxirgi 4 raqam) bo'yicha tez qidirish
CREATE INDEX IF NOT EXISTS "payments_proof_status_idx"
  ON "payments" ("proof_submitted_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_settled_by_id_fkey'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_settled_by_id_fkey"
      FOREIGN KEY ("settled_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
