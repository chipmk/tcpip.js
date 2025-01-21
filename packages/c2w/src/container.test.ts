import { describe, test } from 'vitest';
import { createContainer } from './container.js';

describe('c2w', () => {
  test('container communication', async () => {
    const container = await createContainer({
      wasmUrl: new URL('../shell.wasm', import.meta.url),
    });

    for await (const chunk of container.networkStream
      .readable as unknown as AsyncIterable<Uint8Array>) {
      console.log('chunk', chunk.length);
    }
  });
});
