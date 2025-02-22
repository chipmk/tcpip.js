export { createStack, type NetworkStack } from './stack.js';
export type { NetworkInterface } from './types.js';

export type {
  LoopbackInterface,
  LoopbackInterfaceOptions,
} from './bindings/loopback-interface.js';

export type {
  TunInterface,
  TunInterfaceOptions,
} from './bindings/tun-interface.js';

export type {
  TapInterface,
  TapInterfaceOptions,
} from './bindings/tap-interface.js';

export type {
  BridgeInterface,
  BridgeInterfaceOptions,
} from './bindings/bridge-interface.js';

export type {
  TcpConnectionOptions,
  TcpListenerOptions,
} from './bindings/tcp.js';
export type { TcpConnection, TcpListener } from './bindings/tcp.js';

export type { UdpDatagram, UdpSocketOptions } from './bindings/udp.js';
export type { UdpSocket } from './bindings/udp.js';
