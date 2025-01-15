import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'dist',
    sourcemap: true,
    dts: true,
    minify: true,
    splitting: true,
    esbuildOptions: (options) => {
      options.inject = ['polyfills/disposable.ts'];
    },
  },
]);
