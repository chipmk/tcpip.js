import { asHex } from '../util.js';

// Constants for buffer configuration
const CONTROL_SIZE = 2; // READ_PTR and WRITE_PTR
const WRITE_PTR_INDEX = 0;
const READ_PTR_INDEX = 1;

/**
 * A lock-free ring buffer implementation using SharedArrayBuffer for cross-worker communication.
 * The buffer layout consists of a control section and a data section:
 *
 * Control section (8 bytes):
 *   - 4 bytes: Write pointer (Int32)
 *   - 4 bytes: Read pointer (Int32)
 *
 * Data section:
 *   Continuous stream of bytes that can be partially read/written.
 *   The write and read pointers wrap around when they reach the end.
 */
export class RingBuffer {
  readonly #control: Int32Array;
  readonly #data: Uint8Array;

  #log: (...data: unknown[]) => void = () => {};

  /**
   * Creates a new RingBuffer instance.
   * @param sharedBuffer - The SharedArrayBuffer to use for storage
   * @param log - Optional logging function
   */
  constructor(
    sharedBuffer: SharedArrayBuffer,
    log?: (...data: unknown[]) => void
  ) {
    if (log) {
      this.#log = (...data: unknown[]) => log('RingBuffer:', ...data);
    }

    // Ensure we have enough space for the control structure
    const minSize = CONTROL_SIZE * Int32Array.BYTES_PER_ELEMENT;
    if (sharedBuffer.byteLength < minSize) {
      throw new Error(
        `SharedArrayBuffer too small: need at least ${minSize} bytes for control structure`
      );
    }

    // Initialize control structure
    this.#control = new Int32Array(sharedBuffer, 0, CONTROL_SIZE);

    // Set up data region
    const dataOffset = CONTROL_SIZE * Int32Array.BYTES_PER_ELEMENT;
    this.#data = new Uint8Array(sharedBuffer, dataOffset);

    // Ensure we have at least some space for data
    if (this.#data.length <= 1) {
      throw new Error('Buffer too small: no space available for data');
    }
  }

  /**
   * Checks if there is data available to read.
   */
  get hasData(): boolean {
    return this.writePtr !== this.readPtr;
  }

  /**
   * Gets the current write pointer position.
   */
  get writePtr(): number {
    return Atomics.load(this.#control, WRITE_PTR_INDEX);
  }

  /**
   * Gets the current read pointer position.
   */
  get readPtr(): number {
    return Atomics.load(this.#control, READ_PTR_INDEX);
  }

  /**
   * Gets the buffer capacity in bytes.
   */
  get capacity(): number {
    return this.#data.length;
  }

  /**
   * Gets the number of bytes available to read.
   */
  get availableData(): number {
    const wrPtr = this.writePtr;
    const rdPtr = this.readPtr;
    return (wrPtr - rdPtr + this.capacity) % this.capacity;
  }

  /**
   * Calculates available free space in the buffer.
   */
  get freeSpace(): number {
    return this.#calculateFreeSpace(this.readPtr, this.writePtr);
  }

  /**
   * Writes data to the buffer.
   * @throws {Error} If there isn't enough space
   */
  write(data: Uint8Array): void {
    const wrPtr = this.writePtr;
    const rdPtr = this.readPtr;

    // Check if we have enough space
    const available = this.#calculateFreeSpace(rdPtr, wrPtr);
    if (data.length > available) {
      throw new Error(
        `Buffer full: need ${data.length} bytes, have ${available} bytes`
      );
    }

    // Write the data and update the pointer
    const newWrPtr = this.#writeData(data, wrPtr);

    this.#log('Wrote data:', data.length, 'bytes');

    // Update write pointer atomically
    Atomics.store(this.#control, WRITE_PTR_INDEX, newWrPtr);

    // Wake up any waiting readers
    Atomics.notify(this.#control, WRITE_PTR_INDEX, 1);
  }

  /**
   * Reads data from the buffer. Blocks if the buffer is empty.
   * @param length - Number of bytes to read. If not specified, reads all available data.
   * @returns The read data
   */
  read(length?: number): Uint8Array {
    if (length !== undefined && length <= 0) {
      throw new Error(`Invalid read length: ${length}`);
    }

    while (true) {
      const wrPtr = this.writePtr;
      let rdPtr = this.readPtr;

      if (wrPtr === rdPtr) {
        // Buffer is empty, wait for the write pointer to change
        Atomics.wait(this.#control, WRITE_PTR_INDEX, wrPtr);
        continue;
      }

      // Calculate available data
      const available = (wrPtr - rdPtr + this.capacity) % this.capacity;
      this.#log('Data available:', available, 'bytes, requested:', length);

      // Read what we can
      const readLength = length ? Math.min(length, available) : available;
      const data = this.#readData(rdPtr, readLength);

      this.#log('Read data:', asHex(data), ',', data.length, 'bytes');

      // Update read pointer atomically
      const newRdPtr = (rdPtr + readLength) % this.capacity;
      Atomics.store(this.#control, READ_PTR_INDEX, newRdPtr);

      return data;
    }
  }

  /**
   * Waits for data to be available in the ring buffer.
   * @param timeout - Optional timeout in milliseconds
   * @returns true if data is available, false if timed out
   */
  waitForData(timeout?: number): boolean {
    if (this.hasData) {
      return true;
    }

    const currentWritePtr = this.writePtr;
    Atomics.wait(this.#control, WRITE_PTR_INDEX, currentWritePtr, timeout);

    return this.hasData;
  }

  /**
   * Calculates available free space between read and write pointers.
   */
  #calculateFreeSpace(rdPtr: number, wrPtr: number): number {
    // We reserve one byte to distinguish between full and empty buffer
    return (rdPtr - wrPtr - 1 + this.capacity) % this.capacity;
  }

  /**
   * Writes data to the buffer, handling wrap-around using modulo.
   * @returns New write pointer position
   */
  #writeData(data: Uint8Array, startPos: number): number {
    const capacity = this.capacity;
    const endPos = (startPos + data.length) % capacity;

    if (endPos > startPos) {
      // No wrap-around needed
      this.#data.set(data, startPos);
    } else {
      // Handle wrap-around
      const firstChunkSize = capacity - startPos;
      this.#data.set(data.subarray(0, firstChunkSize), startPos);
      this.#data.set(data.subarray(firstChunkSize), 0);
    }

    return endPos;
  }

  /**
   * Reads data from the buffer, handling wrap-around using modulo.
   */
  #readData(startPos: number, length: number): Uint8Array {
    const result = new Uint8Array(length);
    const capacity = this.capacity;
    const endPos = (startPos + length) % capacity;

    if (endPos > startPos) {
      // No wrap-around needed
      result.set(this.#data.subarray(startPos, startPos + length));
    } else {
      // Handle wrap-around
      const firstChunkSize = capacity - startPos;
      result.set(this.#data.subarray(startPos, startPos + firstChunkSize), 0);
      result.set(
        this.#data.subarray(0, length - firstChunkSize),
        firstChunkSize
      );
    }

    return result;
  }
}
