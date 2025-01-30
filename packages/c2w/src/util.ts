/**
 * Parses a MAC address `Uint8Array` into a `string`.
 */
export function parseMacAddress(mac: Uint8Array) {
  if (mac.length !== 6) {
    throw new Error('invalid mac address');
  }

  return Array.from(mac)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':');
}

/**
 * Generates a random MAC address.
 *
 * The generated address is locally administered (so won't conflict
 * with real devices) and unicast (so it can be used as a source address).
 */
export function generateMacAddress() {
  const mac = new Uint8Array(6);
  crypto.getRandomValues(mac);

  mac[0] =
    // Clear the 2 least significant bits
    (mac[0]! & 0b11111100) |
    // Set locally administered bit (bit 1) to 1 and unicast bit (bit 0) to 0
    0b00000010;

  return mac;
}

/**
 * Converts a `AsyncIterator` into an `ReadableStream`.
 */
export function toReadable<T>(iterator: AsyncIterator<T>) {
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Converts a `ReadableStream` into an `AsyncIterableIterator`.
 *
 * Allows you to use ReadableStreams in a `for await ... of` loop.
 */
export function fromReadable<R>(
  readable: ReadableStream<R>,
  options?: { preventCancel?: boolean }
): AsyncIterableIterator<R> {
  const reader = readable.getReader();
  return fromReader(reader, options);
}

/**
 * Converts a `ReadableStreamDefaultReader` into an `AsyncIterableIterator`.
 *
 * Allows you to use Readers in a `for await ... of` loop.
 */
export async function* fromReader<R>(
  reader: ReadableStreamDefaultReader<R>,
  options?: { preventCancel?: boolean }
): AsyncIterableIterator<R> {
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

export function asHex(data: Uint8Array, delimiter = ' ') {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(delimiter);
}
