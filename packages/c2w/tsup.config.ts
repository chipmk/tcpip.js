import workerPlugin from '@chialab/esbuild-plugin-worker';
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
    external: ['node:fs', 'node:stream'],
    esbuildPlugins: [workerPlugin()],
    esbuildOptions: (options) => {
      options.inject = ['./patches/web-worker.ts'];
    },
  },
]);
