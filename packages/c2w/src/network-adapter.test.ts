import { describe, expect, test } from 'vitest';
import { createContainer } from './container.js';

describe('c2w', () => {
  test('container communication', async () => {
    await createContainer();
  });
});
