import { EventEmitter } from 'eventemitter3';
import Socket from './socket.js';
import Stack from './stack.js';

export interface ServerEventTypes {
  listening: () => void;
  connection: (socket: Socket) => void;
  error: (err: Error) => void;
  end: () => void;
  close: () => void;
}

export interface ServerOptions {}

interface ListenOptions {
  port: number | undefined;
  host?: string | undefined;
}

// Methods implemented in WASM
interface Server {
  readonly listening: boolean;

  listen(options: ListenOptions): this;
  close(callback?: (err: Error) => void): this;
  getConnections(callback: (err: Error, count: number) => void): this;
}

class Server extends EventEmitter<ServerEventTypes> {
  private _init: (options: ServerOptions) => void;

  constructor(public stack: Stack, public options: ServerOptions = {}) {
    super();
    this._init(options);
  }
}

export default Server;
