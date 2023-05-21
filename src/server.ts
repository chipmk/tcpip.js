import EventEmitter from 'eventemitter3';
import Socket from './socket';
import Stack from './stack';

export interface ServerEventTypes {
  connection: (socket: Socket) => void;
  error: (err: Error) => void;
  end: () => void;
  close: (hadError: boolean) => void;
}

export interface ServerOptions {}

interface ListenOptions {
  port: number | undefined;
  host?: string | undefined;
}

// Methods implemented in WASM
interface Server {
  _init(options: ServerOptions): void;
  listen(options: ListenOptions): this;
}

class Server extends EventEmitter<ServerEventTypes> {
  constructor(public stack: Stack, public options: ServerOptions = {}) {
    super();
    this._init(options);
  }
}

export default Server;
