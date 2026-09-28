-- KELMADI (no-show) QARORI: avval admin xabar beradi, keyin refund yoki yakka saqlash.
-- Idempotent.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "no_show_outcome"      TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "no_show_handled_at"   TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "no_show_handled_by_id" TEXT;

-- "Qaror kutilmoqda" bronlarni admin tez topishi uchun
CREATE INDEX IF NOT EXISTS "bookings_no_show_pending_idx"
  ON "bookings" ("no_show_outcome", "session_ended_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_show_handled_by_id_fkey'
  ) THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_no_show_handled_by_id_fkey"
      FOREIGN KEY ("no_show_handled_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
