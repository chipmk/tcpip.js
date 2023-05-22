import { getRandomValues } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';

(globalThis as any).TextEncoder = TextEncoder;
(globalThis as any).TextDecoder = TextDecoder;

(globalThis as any).performance = {
  now() {
    const [sec, nsec] = process.hrtime();
    return sec * 1000 + nsec / 1000000;
  },
};

(globalThis as any).crypto = {
  getRandomValues,
};
