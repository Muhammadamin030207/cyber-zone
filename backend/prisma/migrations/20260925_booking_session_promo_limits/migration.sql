-- DropIndex
DROP INDEX "promo_redemptions_promo_code_id_user_id_key";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "actual_duration_minutes" INTEGER,
ADD COLUMN     "actual_price" DECIMAL(10,2),
ADD COLUMN     "billing_adjustment" DECIMAL(10,2),
ADD COLUMN     "min_billing_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "session_ended_at" TIMESTAMP(3),
ADD COLUMN     "session_started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "is_personal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recipient_email" TEXT,
ADD COLUMN     "recipient_phone" TEXT,
ADD COLUMN     "recipient_user_id" TEXT,
ADD COLUMN     "usage_limit_per_user" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "promo_redemptions_promo_code_id_user_id_idx" ON "promo_redemptions"("promo_code_id", "user_id");

