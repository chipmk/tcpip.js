import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
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
      name: 'chromium',
      include: ['src/**/*.{test,spec}.ts'],
      setupFiles: 'test/setup.ts',
      browser: {
        enabled: true,
        provider: 'playwright',
        name: 'chromium',
        headless: true,
        screenshotFailures: false,
      },
    },
  },
  {
    esbuild: {
      target: 'es2022',
    },
    test: {
      name: 'firefox',
      include: ['src/**/*.{test,spec}.ts'],
      setupFiles: 'test/setup.ts',
      browser: {
        enabled: true,
        provider: 'playwright',
        name: 'firefox',
        headless: true,
        screenshotFailures: false,
      },
    },
  },
  {
    esbuild: {
      target: 'es2022',
    },
    test: {
      name: 'webkit',
      include: ['src/**/*.{test,spec}.ts'],
      setupFiles: 'test/setup.ts',
      browser: {
        enabled: true,
        provider: 'playwright',
        name: 'webkit',
        headless: true,
        screenshotFailures: false,
      },
    },
  },
]);
