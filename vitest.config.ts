import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/tests/core/**', 'happy-dom']],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
