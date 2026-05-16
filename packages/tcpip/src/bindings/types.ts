import type { UniquePointer } from '../util.js';
import type { BridgeExports } from './bridge-interface.js';
import type { IcmpExports } from './icmp.js';
import type { LoopbackExports } from './loopback-interface.js';
import type { TapExports } from './tap-interface.js';
import type { TcpExports } from './tcp.js';
import type { TunExports } from './tun-interface.js';
import type { UdpExports } from './udp.js';

export type Pointer = UniquePointer | 0;

export type CommonExports = {
  get_interface_mac_address(handle: Pointer): Pointer;
  get_interface_ip4_address(handle: Pointer): Pointer;
  get_interface_ip4_netmask(handle: Pointer): Pointer;
};

export type WasiExports = {
  memory: WebAssembly.Memory;
  _initialize(): unknown;
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
  CommonExports &
  LoopbackExports &
  TunExports &
  TapExports &
  BridgeExports &
  TcpExports &
  UdpExports &
  IcmpExports;

export type WasmInstance = {
  exports: WasmExports;
};
