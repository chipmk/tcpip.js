import { proxy, wrap } from 'comlink';
import { RingBuffer } from './ring-buffer.js';

export type { RingBuffer };

/**
 * Creates a ring buffer over a shared array buffer.
 *
 * This is a synchronous ring buffer that blocks via Atomics until
 * data is added to the shared array buffer from another thread.
 */
export function createRingBuffer(
  buffer: SharedArrayBuffer,
  log?: (...data: unknown[]) => void
) {
  return new RingBuffer(buffer, log);
}

/**
 * Creates an asynchronous ring buffer over a shared array buffer.
 *
 * Vanilla ring buffers are synchronous and block via Atomics until
 * data is added to the shared array buffer from another thread.
 * This wrapper uses a worker to provide an asynchronous interface.
 *
 * Can be replaced by `Atomics.waitAsync` once it has better support.
 */
export async function createAsyncRingBuffer(
  buffer: SharedArrayBuffer,
  log?: (...data: unknown[]) => void
) {
  const worker = new Worker(
    new URL('./ring-buffer-worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );

  const AsyncRingBuffer = wrap<typeof RingBuffer>(worker);
  return await new AsyncRingBuffer(buffer, log ? proxy(log) : undefined);
}
