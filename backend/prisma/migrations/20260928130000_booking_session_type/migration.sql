-- UNLIMITED sessiya turi: endTime cheklovi yo'q, sessiya sarflangan vaqt
-- bo'yicha hisoblanadi. Worker UNLIMITED sessiyani avtomatik yopmaydi.
CREATE TYPE "BookingSessionType" AS ENUM ('TIMED', 'UNLIMITED');

ALTER TABLE "bookings" ADD COLUMN "session_type" "BookingSessionType" NOT NULL DEFAULT 'TIMED';