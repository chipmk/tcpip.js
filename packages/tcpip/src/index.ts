export { createStack, NetworkStack } from './stack.js';
export type { NetworkInterface } from './types.js';

export {
  LoopbackInterface,
  type LoopbackInterfaceOptions,
} from './bindings/loopback-interface.js';

export {
  TunInterface,
  type TunInterfaceOptions,
} from './bindings/tun-interface.js';

export {
  TapInterface,
  type TapInterfaceOptions,
} from './bindings/tap-interface.js';

export {
  TcpConnection,
  TcpListener,
  type TcpConnectionOptions,
  type TcpListenerOptions,
} from './bindings/tcp.js';

export {
  UdpSocket,
  type UdpDatagram,
  type UdpSocketOptions,
} from './bindings/udp.js';
