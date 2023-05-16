import TcpipServer from './server';
import TcpipSocket from './socket';

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

/**
 * A user-space TCP/IP network stack
 */
class TcpipStack {
  constructor(public options: TcpipStackOptions) {
    this._init(options);
  }
  public get net() {
    const self = this;
    return {
      Socket: class Socket extends TcpipSocket {
        constructor() {
          super({
            stack: self,
          });
        }
      },
      Server: class Server extends TcpipServer {
        constructor() {
          super({
            stack: self,
          });
        }
      },
    };
  }
}

export default TcpipStack;
