export { createStack, type NetworkStack } from './stack.js';
export type { NetworkInterface } from './types.js';

export { type LoopbackInterfaceOptions } from './bindings/loopback-interface.js';
export type { LoopbackInterface } from './bindings/loopback-interface.js';

export { type TunInterfaceOptions } from './bindings/tun-interface.js';
export type { TunInterface } from './bindings/tun-interface.js';

export {
  VirtualTapInterface as TapInterface,
  type TapInterfaceOptions,
} from './bindings/tap-interface.js';

export { type BridgeInterfaceOptions } from './bindings/bridge-interface.js';
export type { BridgeInterface } from './bindings/bridge-interface.js';

export {
  type TcpConnectionOptions,
  type TcpListenerOptions,
} from './bindings/tcp.js';
export type { TcpConnection, TcpListener } from './bindings/tcp.js';

export { type UdpDatagram, type UdpSocketOptions } from './bindings/udp.js';
export type { UdpSocket } from './bindings/udp.js';
