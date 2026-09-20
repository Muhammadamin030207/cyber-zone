/*
  Warnings:

  - A unique constraint covering the columns `[provider_transaction_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updated_at` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYME', 'CLICK', 'UZUM', 'PAYNET');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE "BookingStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "BookingStatus" ADD VALUE 'PAID';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYNET';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'CREATED';
ALTER TYPE "PaymentStatus" ADD VALUE 'REDIRECT_REQUIRED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAID';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "deposit_percent" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'UZS',
ADD COLUMN     "deposit_percent" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "provider" "PaymentProvider",
ADD COLUMN     "provider_payment_id" TEXT,
ADD COLUMN     "provider_transaction_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "status" DROP DEFAULT;

-- CreateTable
CREATE TABLE "payment_audit_logs" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_audit_logs_payment_id_idx" ON "payment_audit_logs"("payment_id");

-- CreateIndex
CREATE INDEX "payment_audit_logs_action_idx" ON "payment_audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_transaction_id_key" ON "payments"("provider_transaction_id");

-- AddForeignKey
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
