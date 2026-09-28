import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // O'zbek tilida apostrof yozma qoidasining bir qismi: o'z, ma'lumot,
      // to'lov, so'm, yo'q, bo'lsin. JSX matnida apostrof hech narsa buzmaydi
      // (u faqat `{"..."}` ichida xavfli), lekin qoida har satrda `&apos;`
      // yozishni talab qiladi — 76+ joyda matnni o'qib bo'lmaydigan qilib
      // qo'yadi. Shuning uchun butun loyihada o'chirilgan.
      "react/no-unescaped-entities": "off",

      // Ma'lumot yuklash (fetch) `useEffect` ichida — bu yerda tanlangan
      // arxitektura: loyihada react-query/swr yo'q, har bir komponent o'z
      // `load()` funksiyasini axios orqali chaqiradi (masalan admin,
      // dashboard, rooms, news, till). Qoidaning tavsiya qilgan "fetch -> store
      // yoki suspense" yechimiga o'tish butun frontendni qayta yozishni
      // talab qiladi va bu lint-cleanup doirasiga sig'maydi.
      //
      // DIQQAT: bu qoida o'chirilmaydi, faqat `warn` ga tushiriladi. Haqiqiy
      // antipatternlar (render paytida hisoblash, `setState` bilan
      // prop'ni mirror qilish) alohida tuzatildi:
      //   - BookingWidget: availability -> setZoneId/setComputerId effekti
      //     o'rniga render paytida `effectiveZoneId`/`effectiveComputerId`
      //     hisoblanadi;
      //   - TransferPanel: `URL.createObjectURL` render effektidan chiqarilib,
      //     fayl tanlanganda yaratiladi.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
