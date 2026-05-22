import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'types',
      environment: 'node',
      include: ['src/**/*.test-d.ts'],
    },
  },
  {
    esbuild: {
      target: 'es2022',
    },
    test: {
      name: 'node',
      environment: 'node',
      include: ['src/**/*.{test,spec}.ts'],
      setupFiles: 'test/setup.ts',
    },
  },
  {
    esbuild: {
      target: 'es2022',
    },
    test: {
      name: 'browser',
      include: ['src/**/*.{test,spec}.ts'],
      setupFiles: 'test/setup.ts',
      browser: {
        enabled: true,
        provider: 'playwright',
        instances: [
          { browser: 'chromium' },
          { browser: 'firefox' },
          { browser: 'webkit' },
        ],
        headless: true,
        screenshotFailures: false,
      },
    },
  },
]);
