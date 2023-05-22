import LoopbackInterface, {
  LoopbackInterfaceOptions,
} from './interfaces/loopback-interface.js';
import TapInterface, {
  TapInterfaceOptions,
} from './interfaces/tap-interface.js';
import TunInterface, {
  TunInterfaceOptions,
} from './interfaces/tun-interface.js';
import NetServer, { ServerOptions } from './server.js';
import NetSocket, {
  SocketConstructorOpts,
  TcpNetConnectOpts,
} from './socket.js';

export function unwrap<T, Args extends any[]>(
  fn: (...args: Args) => [T, Error]
) {
  return function (...args: Args): T {
    const [value, error] = fn.apply(this, args);
    if (error) {
      throw error;
    }
    return value;
  };
}

export type StackOptions = {};

// Methods implemented in WASM
interface Stack {
  _init(options: StackOptions): void;
}

export interface Net {
  Socket: typeof NetSocket;
  Server: typeof NetServer;
  createServer(options?: ServerOptions): NetServer;
  createConnection(
    options: TcpNetConnectOpts,
    connectionListener?: () => void
  ): NetSocket;
  createConnection(
    port: number,
    host?: string,
    connectionListener?: () => void
  ): NetSocket;
  connect(
    options: TcpNetConnectOpts,
    connectionListener?: () => void
  ): NetSocket;
  connect(
    port: number,
    host?: string,
    connectionListener?: () => void
  ): NetSocket;
}

/**
 * A user-space TCP/IP network stack
 */
class Stack {
  public net: Net;
  constructor(public options: StackOptions = {}) {
    this._init(options);
    const self = this;

    const Socket = class Socket extends NetSocket {
      constructor(options: SocketConstructorOpts = {}) {
        super(self, options);
      }
    };

    const Server = class Server extends NetServer {
      constructor(options: ServerOptions = {}) {
        super(self, options);
      }
    };

    this.net = {
      Socket,
      Server,
      createServer(options: ServerOptions = {}) {
        return new Server(options);
      },
      createConnection(
        optionsOrPort: TcpNetConnectOpts | number,
        listenerOrHost?: (() => void) | string,
        listener?: () => void
      ) {
        if (typeof optionsOrPort === 'object') {
          const socket = new Socket(optionsOrPort);

          const { timeout } = optionsOrPort;

          if (timeout !== undefined && timeout > 0) {
            socket.setTimeout(timeout);
          }

          if (listenerOrHost === undefined) {
            return socket.connect(optionsOrPort);
          }

          if (typeof listenerOrHost !== 'function') {
            throw new Error('Expected second argument to be a listener');
          }

          return socket.connect(optionsOrPort, listenerOrHost);
        }

        const socket = new Socket();

        if (typeof listenerOrHost === 'string') {
          return socket.connect(optionsOrPort, listenerOrHost, listener);
        }

        return socket.connect(optionsOrPort, listenerOrHost);
      },
      connect(
        optionsOrPort: TcpNetConnectOpts | number,
        listenerOrHost?: (() => void) | string,
        listener?: () => void
      ) {
        return this.net.createConnection(
          optionsOrPort,
          listenerOrHost,
          listener
        );
      },
    };
  }

  createLoopbackInterface(options: LoopbackInterfaceOptions) {
    return new LoopbackInterface(this, options);
  }

  createTapInterface(options: TapInterfaceOptions) {
    return new TapInterface(this, options);
  }

  createTunInterface(options: TunInterfaceOptions) {
    return new TunInterface(this, options);
  }
}

export default Stack;
