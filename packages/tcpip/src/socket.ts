import { Duplex } from 'readable-stream';
import Stack from './stack.js';

export interface TcpNetConnectOpts
  extends TcpSocketConnectOpts,
    SocketConstructorOpts {
  timeout?: number | undefined;
}

export interface SocketConstructorOpts {}

export interface TcpSocketConnectOpts {
  port: number;
  host?: string | undefined;
  localAddress?: string | undefined;
  localPort?: number | undefined;
  hints?: number | undefined;
  family?: number | undefined;
  noDelay?: boolean | undefined;
  keepAlive?: boolean | undefined;
  keepAliveInitialDelay?: number | undefined;
}

// Methods implemented in WASM
interface Socket {
  readonly localAddress?: string;
  readonly localPort?: number;
  readonly remoteAddress?: string;
  readonly remotePort?: number;
  readonly timeout?: number | undefined;

  _init(options: SocketConstructorOpts): void;

  write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
  write(
    str: Uint8Array | string,
    encoding?: BufferEncoding,
    cb?: (err?: Error) => void
  ): boolean;

  connect(options: TcpSocketConnectOpts, connectionListener?: () => void): this;
  connect(port: number, host: string, connectionListener?: () => void): this;
  connect(port: number, connectionListener?: () => void): this;

  end(callback?: () => void): this;
  end(buffer: Uint8Array | string, callback?: () => void): this;
  end(
    str: Uint8Array | string,
    encoding?: BufferEncoding,
    callback?: () => void
  ): this;

  // Events
  addListener(event: string, listener: (...args: any[]) => void): this;
  addListener(event: 'close', listener: (hadError: boolean) => void): this;
  addListener(event: 'connect', listener: () => void): this;
  addListener(event: 'data', listener: (data: Buffer) => void): this;
  addListener(event: 'drain', listener: () => void): this;
  addListener(event: 'end', listener: () => void): this;
  addListener(event: 'error', listener: (err: Error) => void): this;
  addListener(
    event: 'lookup',
    listener: (
      err: Error,
      address: string,
      family: string | number,
      host: string
    ) => void
  ): this;
  addListener(event: 'ready', listener: () => void): this;
  addListener(event: 'timeout', listener: () => void): this;
  emit(event: string | symbol, ...args: any[]): boolean;
  emit(event: 'close', hadError: boolean): boolean;
  emit(event: 'connect'): boolean;
  emit(event: 'data', data: Buffer): boolean;
  emit(event: 'drain'): boolean;
  emit(event: 'end'): boolean;
  emit(event: 'error', err: Error): boolean;
  emit(
    event: 'lookup',
    err: Error,
    address: string,
    family: string | number,
    host: string
  ): boolean;
  emit(event: 'ready'): boolean;
  emit(event: 'timeout'): boolean;
  on(event: string, listener: (...args: any[]) => void): this;
  on(event: 'close', listener: (hadError: boolean) => void): this;
  on(event: 'connect', listener: () => void): this;
  on(event: 'data', listener: (data: Buffer) => void): this;
  on(event: 'drain', listener: () => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(
    event: 'lookup',
    listener: (
      err: Error,
      address: string,
      family: string | number,
      host: string
    ) => void
  ): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'timeout', listener: () => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  once(event: 'close', listener: (hadError: boolean) => void): this;
  once(event: 'connect', listener: () => void): this;
  once(event: 'data', listener: (data: Buffer) => void): this;
  once(event: 'drain', listener: () => void): this;
  once(event: 'end', listener: () => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  once(
    event: 'lookup',
    listener: (
      err: Error,
      address: string,
      family: string | number,
      host: string
    ) => void
  ): this;
  once(event: 'ready', listener: () => void): this;
  once(event: 'timeout', listener: () => void): this;
  prependListener(event: string, listener: (...args: any[]) => void): this;
  prependListener(event: 'close', listener: (hadError: boolean) => void): this;
  prependListener(event: 'connect', listener: () => void): this;
  prependListener(event: 'data', listener: (data: Buffer) => void): this;
  prependListener(event: 'drain', listener: () => void): this;
  prependListener(event: 'end', listener: () => void): this;
  prependListener(event: 'error', listener: (err: Error) => void): this;
  prependListener(
    event: 'lookup',
    listener: (
      err: Error,
      address: string,
      family: string | number,
      host: string
    ) => void
  ): this;
  prependListener(event: 'ready', listener: () => void): this;
  prependListener(event: 'timeout', listener: () => void): this;
  prependOnceListener(event: string, listener: (...args: any[]) => void): this;
  prependOnceListener(
    event: 'close',
    listener: (hadError: boolean) => void
  ): this;
  prependOnceListener(event: 'connect', listener: () => void): this;
  prependOnceListener(event: 'data', listener: (data: Buffer) => void): this;
  prependOnceListener(event: 'drain', listener: () => void): this;
  prependOnceListener(event: 'end', listener: () => void): this;
  prependOnceListener(event: 'error', listener: (err: Error) => void): this;
  prependOnceListener(
    event: 'lookup',
    listener: (
      err: Error,
      address: string,
      family: string | number,
      host: string
    ) => void
  ): this;
  prependOnceListener(event: 'ready', listener: () => void): this;
  prependOnceListener(event: 'timeout', listener: () => void): this;

  setNoDelay(noDelay?: boolean): this;
  setTimeout(timeout: number, callback?: () => void): this;
}

class Socket extends Duplex {
  constructor(public stack: Stack, public options: SocketConstructorOpts = {}) {
    super();
    this._init(options);
  }
}

export default Socket;
