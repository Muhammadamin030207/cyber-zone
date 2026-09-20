-- AlterTable
ALTER TABLE "support_messages" ADD COLUMN     "recipient_role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
ADD COLUMN     "room_id" TEXT;

-- CreateIndex
CREATE INDEX "support_messages_recipient_role_idx" ON "support_messages"("recipient_role");

-- CreateIndex
CREATE INDEX "support_messages_room_id_idx" ON "support_messages"("room_id");

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "computer_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
