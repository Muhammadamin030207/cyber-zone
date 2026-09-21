import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/e2e/**/*.e2e.test.ts'],
    globalSetup: ['src/tests/e2e/globalSetup.ts'],
    setupFiles: ['src/tests/e2e/setup.ts'],
    // DB holatiga bog'liq — parallel emas, ketma-ket.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
