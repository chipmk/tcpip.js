export { NetworkStack, createStack } from './stack.js';

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
