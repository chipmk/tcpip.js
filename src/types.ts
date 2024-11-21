import type { LoopbackExports } from './bindings/loopback-interface.js';
import type { TapExports } from './bindings/tap-interface.js';
import type { TcpExports } from './bindings/tcp.js';
import type { TunExports } from './bindings/tun-interface.js';
import type { UniquePointer } from './util.js';

export type Pointer = UniquePointer;

export type WasiExports = {
  memory: WebAssembly.Memory;
  _start(): unknown;
};

export type SysExports = {
  malloc(size: number): number;
  free(ptr: number): void;
};

export type StackExports = {
  process_queued_packets(): void;
  process_timeouts(): void;
};

export type WasmExports = WasiExports &
  SysExports &
  StackExports &
  LoopbackExports &
  TunExports &
  TapExports &
  TcpExports;

export type WasmInstance = {
  exports: WasmExports;
};
