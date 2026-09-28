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
