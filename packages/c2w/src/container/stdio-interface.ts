import {
  createAsyncRingBuffer,
  createRingBuffer,
} from '../ring-buffer/index.js';
import { fromReadable } from '../util.js';
import type { VMStdioOptions } from './vm.js';

export class StdioInterface {
  #stdinBuffer: SharedArrayBuffer;
  #stdoutBuffer: SharedArrayBuffer;
  #stderrBuffer: SharedArrayBuffer;

  readonly stdin: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;

  get iterateStdout() {
    return fromReadable(this.stdout);
  }

  get iterateStderr() {
    return fromReadable(this.stderr);
  }

  /**
   * The stdio options to pass to the VM.
   *
   * Internal use only.
   */
  get vmStdioOptions(): VMStdioOptions {
    return {
      stdinBuffer: this.#stdinBuffer,
      stdoutBuffer: this.#stdoutBuffer,
      stderrBuffer: this.#stderrBuffer,
    };
  }

  constructor() {
    // Create shared buffers for network communication
    this.#stdinBuffer = new SharedArrayBuffer(1024 * 1024);
    this.#stdoutBuffer = new SharedArrayBuffer(1024 * 1024);
    this.#stderrBuffer = new SharedArrayBuffer(1024 * 1024);

    // Create ring buffers for network communication
    const stdinRing = createRingBuffer(
      this.#stdinBuffer
      // (...data: unknown[]) => console.log('Stdio interface: Stdin:', ...data)
    );
    const stdoutRing = createAsyncRingBuffer(
      this.#stdoutBuffer
      // (...data: unknown[]) => console.log('Stdio interface: Stdout:', ...data)
    );
    const stderrRing = createAsyncRingBuffer(
      this.#stderrBuffer
      // (...data: unknown[]) => console.log('Stdio interface: Stderr:', ...data)
    );

    this.stdin = new WritableStream<Uint8Array>({
      write(chunk) {
        stdinRing.write(chunk);
      },
    });

    this.stdout = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          const ring = await stdoutRing;
          const data = await ring.read(controller.desiredSize ?? undefined);

          controller.enqueue(data);
        },
      },
      {
        highWaterMark: 1024 * 1024,
        size(chunk) {
          return chunk.length;
        },
      }
    );

    this.stderr = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          const ring = await stderrRing;
          const data = await ring.read(controller.desiredSize ?? undefined);

          controller.enqueue(data);
        },
      },
      {
        highWaterMark: 1024 * 1024,
        size(chunk) {
          return chunk.length;
        },
      }
    );
  }
}
