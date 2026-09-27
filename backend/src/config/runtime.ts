/**
 * MUHIT (runtime) aniqlash — YAGONA manba.
 *
 * MUAMMO: loyihada `process.env.NODE_ENV === 'production'` ifodasi 6 ta
 * joyda ishlatilgan edi. Bu — XAVFLI naqsh: `NODE_ENV` qo'ymagan muhitda
 * (Render dashboard'da qo'lda yaratilgan service, docker, systemd, CI)
 * barcha shu tekshiruvlar `false` qaytaradi va quyidagilar production'da
 * OCHILADI:
 *   1) vaqtinchalik parol API javobida qaytadi (auth.controller) — hisobni
 *      bosib olish + foydalanuvchilar ro'yxatini ochish (enumeration);
 *   2) email mazmuni (parollar bilan) server loglariga to'g'ridan-to'gri
 *      yoziladi (mailer.ts);
 *   3) xato stack trace'lari mijozga qaytariladi (error.ts) — ichki tuzilma
 *      oshkor bo'ladi;
 *   4) to'lov SANDBOX rejimi yoqilishi mumkin (payment.controller) — "haqiqiy
 *      to'lov" ni soxta qilib imzolash yo'li.
 * Bu holat production'da haqiqatan bo'lgan: `render.yaml` da NODE_ENV
 * `production` bor, lekin live Render service boshqacha yaratilgan
 * (TOTP_AT_REST_KEY va REDIS_URL render.yaml'da e'lon qilingan bo'lishiga
 * qaramay production'da YO'Q) — ya'ni blueprint'dan qochish bor.
 *
 * YECHIM: "production" ni aniqlashda **fail-safe** (xavfsiz tomonga) yondashuv:
 * production DEB hisoblanadi, faqat aniq va atama-ma'no `development`/`test`
 * yozilgan bo'lsa dev hisoblanadi. Ya'ni `NODE_ENV` yo'q, bo'sh yoki noto'g'ri
 * yozilgan bo'lsa — hamisha production rejimi qo'llaniladi.
 *
 * ⚠️ Mahalliy ishlab chiqarish uchun `.env` da `NODE_ENV=development` BO'LISHI
 * SHART (`.env.example` da allaqachon bor). Aks holda lokal dev ham
 * "production" deb hisoblanadi: stack trace yashiriladi va to'lov sandbox
 * o'chadi.
 */
const EXPLICIT_NON_PRODUCTION = new Set(['development', 'dev', 'test', 'local', 'e2e']);

export function isProduction(): boolean {
  const raw = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (!raw) return true; // belgilanmagan -> xavfsiz tomon (production)
  return !EXPLICIT_NON_PRODUCTION.has(raw);
}

/** Aniq dev/test muhiti (faqat test va lokal ishlab chiqarish uchun). */
export function isNonProduction(): boolean {
  return !isProduction();
}
