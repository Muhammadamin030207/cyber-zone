-- Kamerali yuz tekshiruvi (liveness): mijoz "ko'z pirpirash" tekshiruvidan
-- o'tganini bronadagi vaqt bayonidan bilamiz.

ALTER TABLE "bookings" ADD COLUMN "face_verified_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "face_verified_by_id" TEXT;