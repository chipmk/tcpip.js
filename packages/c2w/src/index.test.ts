import { describe, test } from 'vitest';
import { createContainer } from './container/index.js';

describe('c2w', () => {
  test('container communication', async () => {
    const container = await createContainer({
      wasmUrl: new URL('../shell.wasm', import.meta.url),
    });

    for await (const chunk of container.netInterface) {
      console.log('chunk', chunk.length);
    }
  });
});
