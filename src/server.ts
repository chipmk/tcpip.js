import EventEmitter from 'eventemitter3';
import Socket from './socket';
import TcpipStack from './tcpip-stack';

interface EventTypes {
  connection: (socket: Socket) => void;
  error: (err: Error) => void;
  end: () => void;
  close: (hadError: boolean) => void;
}

interface ServerOptions {
  stack: TcpipStack;
}

interface ListenOptions {
  port: number | undefined;
  host?: string | undefined;
}

// Methods implemented in WASM
interface Server {
  _init(options: ServerOptions): void;
  listen(options: ListenOptions): this;
}

class Server extends EventEmitter<EventTypes> {
  constructor(public options: ServerOptions) {
    super();
    this._init(options);
  }
}

export default Server;
