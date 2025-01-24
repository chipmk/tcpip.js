import { frameStream } from '../frame/length-prefixed-frames.js';
import {
  createAsyncRingBuffer,
  createRingBuffer,
} from '../ring-buffer/index.js';
import type { DuplexStream } from '../types.js';
import { fromReadable, generateMacAddress, parseMacAddress } from '../util.js';
import type { VMNetOptions } from './vm.js';

export type NetworkInterfaceOptions = {
  /**
   * The MAC address to assign to the VM.
   *
   * If not provided, a random MAC address will be generated.
   */
  macAddress?: string;
};

export class NetworkInterface
  implements DuplexStream<Uint8Array>, AsyncIterable<Uint8Array>
{
  #receiveBuffer: SharedArrayBuffer;
  #sendBuffer: SharedArrayBuffer;

  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  readonly macAddress: string;

  /**
   * The network options to pass to the VM.
   *
   * Internal use only.
   */
  get vmNetOptions(): VMNetOptions {
    return {
      receiveBuffer: this.#sendBuffer, // VM reads from sendBuffer
      sendBuffer: this.#receiveBuffer, // VM writes to receiveBuffer
      macAddress: this.macAddress,
    };
  }

  constructor(options: NetworkInterfaceOptions) {
    this.macAddress =
      options.macAddress ?? parseMacAddress(generateMacAddress());

    // Create shared buffers for network communication
    this.#receiveBuffer = new SharedArrayBuffer(1024 * 1024);
    this.#sendBuffer = new SharedArrayBuffer(1024 * 1024);

    // Create ring buffers for network communication
    const receiveRingPromise = createAsyncRingBuffer(
      this.#receiveBuffer,
      (...data: unknown[]) => console.log('Net interface: Receive:', ...data)
    );
    const sendRing = createRingBuffer(this.#sendBuffer, (...data: unknown[]) =>
      console.log('Net interface: Send:', ...data)
    );

    // Create a raw duplex stream for reading and writing frames
    const rawStream: DuplexStream<Uint8Array> = {
      readable: new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            const receiveRing = await receiveRingPromise;
            const data = await receiveRing.read(
              controller.desiredSize ?? undefined
            );

            controller.enqueue(data);
          },
        },
        {
          highWaterMark: 1024 * 1024,
          size(chunk) {
            return chunk.length;
          },
        }
      ),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          sendRing.write(chunk);
        },
      }),
    };

    // c2w uses 4-byte length-prefixed frames
    const { readable, writable } = frameStream(rawStream, { headerLength: 4 });

    // Expose streams for external reading and writing
    this.readable = readable;
    this.writable = writable;
  }

  listen() {
    if (this.readable.locked) {
      throw new Error('readable stream already locked');
    }
    return fromReadable(this.readable);
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    return this.listen();
  }
}
