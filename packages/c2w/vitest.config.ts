import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [
        {
          browser: 'chromium',
        },
      ],
      headless: true,
      screenshotFailures: false,
    },
    forceRerunTriggers: ['**/workers/**'],
  },
});
