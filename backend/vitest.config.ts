import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // E2E testlar alohida config (vitest.e2e.config.ts) orqali ishlaydi.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/tests/e2e/**'],
  },
});
