import { proxy, wrap } from 'comlink';
import { RingBuffer } from './ring-buffer.js';
import type { VM, VMOptions } from './workers/vm-worker.js';

async function createVMWorker(options: VMOptions) {
  const vmWorker = new Worker(
    new URL('./workers/vm-worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );

  const VMWorker = wrap<typeof VM>(vmWorker);
  return await new VMWorker(
    {
      wasmUrl: String(options.wasmUrl),
      netReceiveBuffer: options.netReceiveBuffer,
      netSendBuffer: options.netSendBuffer,
    },
    proxy(console.log)
  );
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
async function createAsyncRingBuffer(buffer: SharedArrayBuffer) {
  const worker = new Worker(
    new URL('./workers/ring-buffer-worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );

  const AsyncRingBuffer = wrap<typeof RingBuffer>(worker);
  return await new AsyncRingBuffer(buffer);
}

export type ContainerOptions = {
  wasmUrl: string | URL;
};

export async function createContainer(options: ContainerOptions) {
  const receiveBuffer = new SharedArrayBuffer(1024 * 1024);
  const sendBuffer = new SharedArrayBuffer(1024 * 1024);

  // Initialize the shared data
  const receiveView = new Int32Array(receiveBuffer);
  const sendView = new Int32Array(sendBuffer);
  Atomics.store(receiveView, 0, 0);
  Atomics.store(sendView, 0, 0);

  const vmWorker = await createVMWorker({
    wasmUrl: options.wasmUrl,
    netReceiveBuffer: sendBuffer, // VM reads from sendBuffer
    netSendBuffer: receiveBuffer, // VM writes to receiveBuffer
  });

  const receiveRing = await createAsyncRingBuffer(receiveBuffer);
  const sendRing = new RingBuffer(sendBuffer);

  const readable = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const data = await receiveRing.read(
          controller.desiredSize ?? undefined
        );
        const dataView = new DataView(
          data.buffer,
          data.byteOffset,
          data.byteLength
        );

        // The first 4 bytes are the length of the frame
        const length = dataView.getUint32(0);

        // The rest is the frame data
        const frameData = data.subarray(4);

        if (length !== frameData.length) {
          throw new Error('invalid frame length');
        }

        controller.enqueue(frameData);
      },
    },
    {
      highWaterMark: 1024 * 1024,
      size(chunk) {
        return chunk.length;
      },
    }
  );

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      sendRing.write(chunk);
    },
  });

  vmWorker.run();

  const networkStream = {
    readable,
    writable,
  };

  return {
    networkStream,
  };
}

function asHex(data: Uint8Array, delimiter = ' ') {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(delimiter);
}
