import LoopbackInterface, {
  LoopbackInterfaceOptions,
} from './interfaces/loopback-interface';
import TapInterface, { TapInterfaceOptions } from './interfaces/tap-interface';
import TunInterface, { TunInterfaceOptions } from './interfaces/tun-interface';
import NetServer, { ServerOptions } from './server';
import NetSocket, { SocketOptions } from './socket';

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

export type TcpipStackOptions = {};

// Methods implemented in WASM
interface TcpipStack {
  _init(options: TcpipStackOptions): void;
}

interface Net {
  Socket: typeof NetSocket;
  Server: typeof NetServer;
  createServer(options?: ServerOptions): NetServer;
  createConnection(
    options?: SocketOptions,
    connectionListener?: () => void
  ): NetSocket;
  createConnection(
    port: number,
    host?: string,
    connectionListener?: () => void
  ): NetSocket;
  connect(options?: SocketOptions, connectionListener?: () => void): NetSocket;
  connect(
    port: number,
    host?: string,
    connectionListener?: () => void
  ): NetSocket;
}

/**
 * A user-space TCP/IP network stack
 */
class TcpipStack {
  public net: Net;
  constructor(public options: TcpipStackOptions = {}) {
    this._init(options);
    const self = this;

    const Socket = class Socket extends NetSocket {
      constructor(options: SocketOptions = {}) {
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
      createConnection(options: SocketOptions = {}) {
        return new Socket(options);
      },
      connect(options: SocketOptions = {}) {
        return new Socket(options);
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

export default TcpipStack;
