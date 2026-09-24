import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
