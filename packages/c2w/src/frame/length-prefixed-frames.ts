import type { DuplexStream } from '../types.js';
import { fromReadable, toReadable } from '../util.js';
import { collectFrames, concat } from './collect.js';

export type FrameStreamOptions = {
  headerLength?: 1 | 2 | 4;
};

/**
 * Frames each message in a stream so that whole messages are guaranteed
 * after they are sent over a transport that segments messages.
 *
 * This uses a simple length-prefixed framing protocol where the length
 * of the data is prefixed before the data itself. Defaults to a
 * 4-byte (32 bit) header which supports messages up to 4GB each.
 * You can adjust this header using the `headerLength` option.
 * Use shorter headers to reduce per-message overhead at the cost
 * of limiting the maximum message size. Use longer headers to
 * increase maximum message size at the cost of higher overhead
 * per-message.
 */
export function frameStream(
  stream: DuplexStream<Uint8Array>,
  options: FrameStreamOptions = {}
): DuplexStream<Uint8Array> {
  const { headerLength = 4 } = options;

  // Collect incoming chunks into messages
  const messageIterator = collectMessages(fromReadable(stream.readable), {
    headerLength,
  })[Symbol.asyncIterator]();

  // Add frame to outgoing messages
  const frameTransform = new TransformStream<Uint8Array, Uint8Array>({
    transform(message, controller) {
      controller.enqueue(frameMessage(message, { headerLength }));
    },
  });
  frameTransform.readable.pipeTo(stream.writable);

  const readable = toReadable(messageIterator);
  const writable = frameTransform.writable;

  return { readable, writable };
}

/**
 * Buffers partial byte chunks and yields whole message frames as
 * they become available.
 *
 * This uses a simple length-prefixed framing protocol where the length
 * of the data is prefixed before the data itself. Defaults to a
 * 4-byte (32 bit) header which supports messages up to 4GB each.
 * You can adjust this header using the `headerLength` option.
 * Use shorter headers to reduce per-message overhead at the cost
 * of limiting the maximum message size. Use longer headers to
 * increase maximum message size at the cost of higher overhead
 * per-message.
 *
 * Strips the header from the yielded message.
 */
export async function* collectMessages(
  chunks: AsyncIterable<Uint8Array>,
  options: FrameStreamOptions = {}
): AsyncIterable<Uint8Array> {
  const { headerLength = 4 } = options;

  const frames = collectFrames(chunks, {
    headerLength,
    frameLength(headerBytes) {
      const length = parseHeader(headerBytes, headerLength);
      return headerLength + length;
    },
  });

  // Strip the header from each frame
  for await (const frame of frames) {
    yield frame.subarray(headerLength);
  }
}

/**
 * Frames a message using a simple length-prefixed framing protocol
 * where the length of the data is prefixed before the data itself.
 *
 * Defaults to a 4-byte (32 bit) header which supports messages up to
 * 4GB each. You can adjust this header using the `headerLength` option.
 * Use shorter headers to reduce per-message overhead at the cost
 * of limiting the maximum message size. Use longer headers to
 * increase maximum message size at the cost of higher overhead
 * per-message.
 */
export function frameMessage(
  message: Uint8Array,
  options: FrameStreamOptions = {}
) {
  const { headerLength = 4 } = options;
  const maxMessageLength = 2 ** (8 * headerLength);

  if (message.byteLength > maxMessageLength) {
    throw new Error(`message exceeds max length of ${maxMessageLength} bytes`);
  }

  const headerBuffer = new ArrayBuffer(headerLength);
  const dataView = new DataView(headerBuffer);

  switch (headerLength) {
    case 1: {
      dataView.setUint8(0, message.byteLength);
      break;
    }
    case 2: {
      dataView.setUint16(0, message.byteLength);
      break;
    }
    case 4: {
      dataView.setUint32(0, message.byteLength);
      break;
    }
  }

  return concat(new Uint8Array(headerBuffer), message);
}

function parseHeader(headerBytes: Uint8Array, headerLength: 1 | 2 | 4) {
  const dataView = new DataView(
    headerBytes.buffer,
    headerBytes.byteOffset,
    headerBytes.byteLength
  );

  switch (headerLength) {
    case 1: {
      return dataView.getUint8(0);
    }
    case 2: {
      return dataView.getUint16(0);
    }
    case 4: {
      return dataView.getUint32(0);
    }
  }

  throw new Error('invalid header length');
}
