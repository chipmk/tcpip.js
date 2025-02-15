import type { SysExports, WasiExports } from '../types.js';
import { UniquePointer } from '../util.js';

export abstract class Bindings<Imports, Exports> {
  #exports?: Exports & WasiExports & SysExports;

  abstract imports: Imports;
  get exports(): Exports & WasiExports & SysExports {
    if (!this.#exports) {
      throw new Error('exports were not registered');
    }
    return this.#exports;
  }

  register(exports: Exports & WasiExports & SysExports) {
    this.#exports = exports;
  }

  smartMalloc(size: number) {
    return new UniquePointer(this.exports.malloc(size), this.exports.free);
  }

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

  copyFromMemory(ptr: number, length: number): Uint8Array {
    const buffer = this.exports.memory.buffer.slice(ptr, ptr + length);
    return new Uint8Array(buffer);
  }
}
