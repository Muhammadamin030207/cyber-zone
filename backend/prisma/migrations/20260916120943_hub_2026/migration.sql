-- CreateEnum
CREATE TYPE "BarItemCategory" AS ENUM ('DRINK', 'FOOD', 'DESSERT');

-- CreateEnum
CREATE TYPE "BarOrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'HUMO';

-- AlterTable
ALTER TABLE "computer_rooms" ADD COLUMN     "city" TEXT NOT NULL DEFAULT 'Toshkent',
ADD COLUMN     "district" TEXT;

-- CreateTable
CREATE TABLE "bar_items" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "category" "BarItemCategory" NOT NULL DEFAULT 'DRINK',
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bar_orders" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "user_id" TEXT NOT NULL,
    "seat_number" TEXT,
    "items" JSONB NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "status" "BarOrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bar_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bar_orders_booking_id_key" ON "bar_orders"("booking_id");

-- AddForeignKey
ALTER TABLE "bar_items" ADD CONSTRAINT "bar_items_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "computer_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_orders" ADD CONSTRAINT "bar_orders_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "computer_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_orders" ADD CONSTRAINT "bar_orders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_orders" ADD CONSTRAINT "bar_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "computer_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
