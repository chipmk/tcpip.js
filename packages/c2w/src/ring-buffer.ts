// Store three Int32s for control: CONTROL_SIGNAL, WRITE_PTR, READ_PTR
const CONTROL_SIZE = 3;
const CONTROL_SIGNAL_INDEX = 0;
const WRITE_PTR_INDEX = 1;
const READ_PTR_INDEX = 2;

/**
 * A ring buffer that uses a SharedArrayBuffer for storage.
 * The layout of the underlying SharedArrayBuffer is:
 *
 * `[ int32: CONTROL_SIGNAL, int32: WRITE_PTR, int32: READ_PTR ] + [ data region in bytes ]`
 *
 * So total size = `(CONTROL_SIZE * 4) + capacityInBytes`
 *
 * This class reads/writes "messages" in the ring. Each message is stored as:
 *
 * `[ 4-byte length (little-endian) ] + [ message bytes ]`
 */
export class RingBuffer {
  #control: Int32Array;
  #data: Uint8Array;

  constructor(sharedBuffer: SharedArrayBuffer) {
    // The first 3 Int32s are for control
    this.#control = new Int32Array(sharedBuffer, 0, CONTROL_SIZE);

    const byteOffset = CONTROL_SIZE * Int32Array.BYTES_PER_ELEMENT;
    this.#data = new Uint8Array(sharedBuffer, byteOffset);
  }

  /**
   * Writes a single message into the ring buffer. If there's
   * not enough space, throws an error.
   */
  write(msg: Uint8Array) {
    const capacity = this.#data.length;

    // Current read/write pointers
    const wrPtr = Atomics.load(this.#control, WRITE_PTR_INDEX);
    const rdPtr = Atomics.load(this.#control, READ_PTR_INDEX);

    // 4 bytes for length + actual message length
    const needed = 4 + msg.length;

    // Calculate free space
    const freeSpace = (rdPtr - wrPtr - 1 + capacity) % capacity;
    if (needed > freeSpace) {
      throw new Error(
        `Not enough space in ring buffer (need ${needed}, have ${freeSpace})`
      );
    }

    // Write the message length (4 bytes) in little-endian
    this.#writeInt32(wrPtr, msg.length);
    let newWrPtr = (wrPtr + 4) % capacity;

    // Write the actual bytes
    if (newWrPtr + msg.length <= capacity) {
      // no wrap
      this.#data.set(msg, newWrPtr);
      newWrPtr += msg.length;
    } else {
      // wrap
      const firstChunkSize = capacity - newWrPtr;
      this.#data.set(msg.subarray(0, firstChunkSize), newWrPtr);
      const secondChunkSize = msg.length - firstChunkSize;
      this.#data.set(msg.subarray(firstChunkSize), 0);
      newWrPtr = secondChunkSize; // we've wrapped
    }
    newWrPtr %= capacity;

    // Store updated write pointer
    Atomics.store(this.#control, WRITE_PTR_INDEX, newWrPtr);

    // Notify any readers that might be waiting
    Atomics.notify(this.#control, CONTROL_SIGNAL_INDEX, 1);
  }

  /**
   * Reads a single message from the ring buffer, blocking if empty
   * (via Atomics.wait).
   */
  read(): Uint8Array {
    const capacity = this.#data.length;

    while (true) {
      const wrPtr = Atomics.load(this.#control, WRITE_PTR_INDEX);
      let rdPtr = Atomics.load(this.#control, READ_PTR_INDEX);

      if (wrPtr === rdPtr) {
        // Buffer is empty, so wait
        Atomics.wait(this.#control, CONTROL_SIGNAL_INDEX, 0);
        continue;
      }

      // There's data, so read the length
      const length = this.#readInt32(rdPtr);
      rdPtr = (rdPtr + 4) % capacity;

      // Read the message
      const result = new Uint8Array(length);
      if (rdPtr + length <= capacity) {
        // no wrap
        result.set(this.#data.subarray(rdPtr, rdPtr + length));
        rdPtr += length;
      } else {
        // wrap
        const firstChunkSize = capacity - rdPtr;
        result.set(this.#data.subarray(rdPtr, rdPtr + firstChunkSize), 0);
        const secondChunkSize = length - firstChunkSize;
        result.set(this.#data.subarray(0, secondChunkSize), firstChunkSize);
        rdPtr = secondChunkSize;
      }
      rdPtr %= capacity;

      Atomics.store(this.#control, READ_PTR_INDEX, rdPtr);

      return result;
    }
  }

  /**
   * Helper to write a 32-bit integer into the ring buffer while
   * handling wrap-around.
   */
  #writeInt32(offset: number, value: number) {
    const cap = this.#data.length;
    this.#data[offset] = value & 0xff;
    this.#data[(offset + 1) % cap] = (value >>> 8) & 0xff;
    this.#data[(offset + 2) % cap] = (value >>> 16) & 0xff;
    this.#data[(offset + 3) % cap] = (value >>> 24) & 0xff;
  }

  /**
   * Helper to read a 32-bit integer from the ring buffer while
   * handling wrap-around.
   */
  #readInt32(offset: number) {
    const cap = this.#data.length;
    const b0 = this.#data[offset]!;
    const b1 = this.#data[(offset + 1) % cap]!;
    const b2 = this.#data[(offset + 2) % cap]!;
    const b3 = this.#data[(offset + 3) % cap]!;
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }
}
