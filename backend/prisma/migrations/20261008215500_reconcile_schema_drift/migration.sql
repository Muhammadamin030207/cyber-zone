-- PRE-EXISTING DRIFT (2026): skema yangilangan, lekin migratsiya yozilmagan.
-- Oldingi indekslar schema'da yo'q (yangilariga almashtirilgan), `settled_by_id`
-- FK migratsiyalarda yo'q edi. Natija: BO'SH bazani migratsiyalardan qayta
-- qurib bo'lmasdi (checkMigrations drift). Bu migratsiya migratsiya tarixi va
-- `prisma/schema.prisma` ni MOSLASHTIRADI (idempotent).

-- Eski (almashtirilgan) indekslar — schema ularni endi e'lon qilmaydi.
DROP INDEX IF EXISTS "bookings_no_show_pending_idx";
DROP INDEX IF EXISTS "payments_debt_open_due_idx";
DROP INDEX IF EXISTS "payments_proof_status_idx";

-- proof_card_last4: migratsiya tarixi eski turda (VARCHAR), schema String -> TEXT.
ALTER TABLE "payments" ALTER COLUMN "proof_card_last4" SET DATA TYPE TEXT;

-- schema'da `settledBy` munosabati bor, migratsiyalarda FK yo'q edi.
-- (DROP + ADD: bir xil skemada qayta ishga tushiriganda ham xavfsiz.)
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_settled_by_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_settled_by_id_fkey"
  FOREIGN KEY ("settled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
