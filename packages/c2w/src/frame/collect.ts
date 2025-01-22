export type CollectFrameOptions = {
  /**
   * The length of the header. Optionally accepts a callback for situations
   * where header length could change over the course of the protocol lifecycle.
   */
  headerLength: number | (() => number | Promise<number>);

  /**
   * The length of the entire frame (including header). Accepts a callback passing
   * in the header bytes that can be used to determine the full frame length.
   */
  frameLength: number | ((header: Uint8Array) => number | Promise<number>);
};

/**
 * General purpose method to buffer partial byte chunks and yield whole frames as
 * they become available.
 *
 * Works with any header-based framing protocol that can determine the full size
 * of each frame from the header.
 */
export async function* collectFrames(
  chunks: AsyncIterable<Uint8Array>,
  options: CollectFrameOptions,
): AsyncIterable<Uint8Array> {
  let buffer = new Uint8Array();

  const getHeaderLength = async () =>
    typeof options.headerLength === 'number' ? options.headerLength : await options.headerLength();

  const getFrameLength = async (header: Uint8Array) =>
    typeof options.frameLength === 'number'
      ? options.frameLength
      : await options.frameLength(header);

  for await (const chunk of chunks) {
    // Append chunk to buffer
    buffer = concat(buffer, chunk);

    let headerLength = await getHeaderLength();

    // Loop as long as we have enough bytes for a header
    while (buffer.byteLength >= headerLength) {
      const header = buffer.subarray(0, headerLength);
      const frameLength = await getFrameLength(header);

      // If we're still waiting on bytes, break
      if (buffer.byteLength < frameLength) {
        break;
      }

      // Yield the frame
      yield buffer.subarray(0, frameLength);

      // Update the buffer to discard this frame
      buffer = buffer.subarray(frameLength);

      // Some protocols allow different header lengths
      // throughout their lifecycle, so re-evaluate
      headerLength = await getHeaderLength();
    }
  }
}

export function concat(bufferA: Uint8Array, bufferB: Uint8Array): Uint8Array {
  const concatenatedArray = new Uint8Array(bufferA.length + bufferB.length);
  concatenatedArray.set(bufferA);
  concatenatedArray.set(bufferB, bufferA.length);
  return concatenatedArray;
}
