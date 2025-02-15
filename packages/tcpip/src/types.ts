import type { BridgeExports } from './bindings/bridge-interface.js';
import type {
  LoopbackExports,
  LoopbackInterface,
} from './bindings/loopback-interface.js';
import type { TapExports, TapInterface } from './bindings/tap-interface.js';
import type { TcpExports } from './bindings/tcp.js';
import type { TunExports, TunInterface } from './bindings/tun-interface.js';
import type { UdpExports } from './bindings/udp.js';
import type { UniquePointer } from './util.js';

export type Pointer = UniquePointer | 0;

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
  BridgeExports &
  TcpExports &
  UdpExports;

export type WasmInstance = {
  exports: WasmExports;
};

export type NetworkInterface = LoopbackInterface | TunInterface | TapInterface;
