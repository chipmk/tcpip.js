import { defineConfig } from 'tsup';

export default defineConfig(
  (['cjs', 'esm'] as const).map((format) => ({
    entry: ['src/index.ts', 'src/types.ts'],
    format: [format],
    outDir: 'dist',
    sourcemap: true,
    dts: true,
    minify: true,
    // Keep CJS on esbuild's native transform for private fields and methods.
    splitting: format === 'esm',
    shims: format === 'cjs',
    esbuildOptions: (options) => {
      options.inject = [...(options.inject ?? []), 'polyfills/disposable.ts'];
    },
  }))
);
