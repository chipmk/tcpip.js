export type DuplexStream<T = unknown> = {
  readable: ReadableStream<T>;
  writable: WritableStream<T>;
};

export type StreamConnectOptions = {
  host: string;
  port: number;
};

export type StreamListenOptions = {
  host?: string;
  port: number;
};

export type StreamConnection = DuplexStream<Uint8Array> & {
  close(): Promise<void>;
};

export type StreamListener = {
  [Symbol.asyncIterator](): AsyncIterableIterator<StreamConnection>;
};

export type StreamTransport = {
  /**
   * Establishes an outbound stream connection to a remote host/port.
   */
  connect(options: StreamConnectOptions): Promise<StreamConnection>;
  /**
   * Listens for incoming stream connections on the specified host/port.
   */
  listen?(options: StreamListenOptions): Promise<StreamListener>;
};

export type Datagram = {
  host: string;
  port: number;
  data: Uint8Array;
};

export type DatagramSocketOptions = {
  /**
   * The local host to bind to.
   *
   * If not provided, the socket will bind to all available interfaces.
   */
  host?: string;
  /**
   * The local port to bind to.
   *
   * If not provided, the socket will bind to a random port.
   */
  port?: number;
};

export type DatagramSocket = DuplexStream<Datagram> & {
  close(): Promise<void>;
};

export type DatagramTransport = {
  /**
   * Opens a datagram socket for sending and receiving complete datagrams.
   */
  open(options?: DatagramSocketOptions): Promise<DatagramSocket>;
};

/**
 * Converts a `ReadableStream` into an `AsyncIterableIterator`.
 *
 * Allows you to use `ReadableStream`s in a `for await ... of` loop.
 */
export function fromReadable<T>(
  readable: ReadableStream<T>,
  options?: { preventCancel?: boolean }
): AsyncIterableIterator<T> {
  const reader = readable.getReader();
  return fromReader(reader, options);
}

/**
 * Converts a `ReadableStreamDefaultReader` into an `AsyncIterableIterator`.
 *
 * Allows you to use readers in a `for await ... of` loop.
 */
export async function* fromReader<T>(
  reader: ReadableStreamDefaultReader<T>,
  options?: { preventCancel?: boolean }
): AsyncIterableIterator<T> {
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return value;
      }
      yield value;
    }
  } finally {
    if (!options?.preventCancel) {
      await reader.cancel();
    }
    reader.releaseLock();
  }
}

export type ConnectStreamsOptions = {
  transformAtoB?: (chunk: Uint8Array) => Uint8Array;
  transformBtoA?: (chunk: Uint8Array) => Uint8Array;
};

/**
 * Connects two byte duplex streams by piping each stream's `readable`
 * to the other's `writable`.
 *
 * Optionally supports transforming the data as it is passed
 * between the two streams. Use this to log or modify the data.
 */
export function connectStreams(
  streamA: DuplexStream<Uint8Array>,
  streamB: DuplexStream<Uint8Array>,
  { transformAtoB, transformBtoA }: ConnectStreamsOptions = {}
) {
  const readableA = transformAtoB
    ? streamA.readable.pipeThrough(
        new TransformStream<Uint8Array>({
          transform(chunk, controller) {
            try {
              const transformedChunk = transformAtoB(chunk);
              controller.enqueue(transformedChunk);
            } catch (error) {
              console.warn('Error transforming A to B', error);
            }
          },
        })
      )
    : streamA.readable;

  const readableB = transformBtoA
    ? streamB.readable.pipeThrough(
        new TransformStream<Uint8Array>({
          transform(chunk, controller) {
            try {
              const transformedChunk = transformBtoA(chunk);
              controller.enqueue(transformedChunk);
            } catch (error) {
              console.warn('Error transforming B to A', error);
            }
          },
        })
      )
    : streamB.readable;

  readableA.pipeTo(streamB.writable);
  readableB.pipeTo(streamA.writable);
}
