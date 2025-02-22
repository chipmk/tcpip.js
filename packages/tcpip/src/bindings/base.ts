import type { Pointer, SysExports, WasiExports } from '../types.js';
import { UniquePointer } from '../util.js';

export type CommonExports = {
  get_interface_mac_address(handle: Pointer): Pointer;
  get_interface_ip4_address(handle: Pointer): Pointer;
  get_interface_ip4_netmask(handle: Pointer): Pointer;
};

export abstract class Bindings<Imports, Exports> {
  #exports?: Exports & CommonExports & WasiExports & SysExports;

  abstract imports: Imports;

  get exports(): Exports & CommonExports & WasiExports & SysExports {
    if (!this.#exports) {
      throw new Error('exports were not registered');
    }
    return this.#exports;
  }

  /**
   * Register the exports object from the wasm module.
   */
  register(exports: Exports & CommonExports & WasiExports & SysExports) {
    this.#exports = exports;
  }

  /**
   * Allocates a region of wasm memory and returns a `UniquePointer` to the start.
   *
   * `UniquePointer` will automatically free the memory when it is disposed.
   * It is intended to be used with the `using` statement which will automatically
   * dispose of the pointer when the current scope ends.
   */
  smartMalloc(size: number) {
    return new UniquePointer(this.exports.malloc(size), this.exports.free);
  }

  /**
   * Copies a Uint8Array to a newly allocated region of wasm memory.
   *
   * @returns A pointer to the start of the copied data.
   */
  copyToMemory(data: ArrayBuffer) {
    const bytes = new Uint8Array(data);
    const length = bytes.length;
    const pointer = this.smartMalloc(length);

    const memoryView = new Uint8Array(
      this.exports.memory.buffer,
      pointer.valueOf(),
      length
    );

    memoryView.set(bytes);

    return pointer;
  }

  /**
   * Copies a region of wasm memory to a new Uint8Array.
   *
   * @returns A new Uint8Array containing the copied data.
   */
  copyFromMemory(ptr: Pointer | number, length: number): Uint8Array {
    const buffer = this.exports.memory.buffer.slice(
      Number(ptr),
      Number(ptr) + length
    );
    return new Uint8Array(buffer);
  }

  /**
   * Creates a Uint8Array view over a region of wasm memory.
   */
  viewFromMemory(ptr: Pointer | number, length: number): Uint8Array {
    return new Uint8Array(this.exports.memory.buffer, Number(ptr), length);
  }
}
