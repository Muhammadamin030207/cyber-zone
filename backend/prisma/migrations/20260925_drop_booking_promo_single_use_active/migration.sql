-- Per-account promo limit (1..20) endi SERVER-kodda (advisory lock + hisob) kafolatlanadi.
-- Avvalgi "1 ta faol promo bron" DB darajasida qat'iy cheklaydigan partial-unique index
-- N marta (usageLimitPerUser) ishlatishga xalaqit beradi — uni olib tashlaymiz.
DROP INDEX IF EXISTS "bookings_promo_single_use_active";