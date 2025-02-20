import type { DnsClient } from '@tcpip/dns';
import { serializeIPv4Address, type IPv4Address } from '@tcpip/wire';
import { LwipError } from '../lwip/errors.js';
import type { Pointer } from '../types.js';
import { EventMap, fromReadable, Hooks, nextMicrotask } from '../util.js';
import { Bindings } from './base.js';

type TcpListenerHandle = Pointer;
type TcpConnectionHandle = Pointer;

type TcpListenerOuterHooks = {};

type TcpListenerInnerHooks = {
  accept(connection: TcpConnection): void;
};

type TcpConnectionOuterHooks = {
  send(data: Uint8Array): Promise<void>;
  updateReceiveBuffer(length: number): void;
  close(): Promise<void>;
};

type TcpConnectionInnerHooks = {
  receive(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
};

const tcpListenerHooks = new Hooks<
  TcpListener,
  TcpListenerOuterHooks,
  TcpListenerInnerHooks
>();

const tcpConnectionHooks = new Hooks<
  TcpConnection,
  TcpConnectionOuterHooks,
  TcpConnectionInnerHooks
>();

export const MAX_SEGMENT_SIZE = 1460; // This must match TCP_MSS in lwipopts.h
export const MAX_WINDOW_SIZE = MAX_SEGMENT_SIZE * 4; // This must match TCP_WND in lwipopts.h
export const SEND_BUFFER_SIZE = MAX_SEGMENT_SIZE * 4; // This must match TCP_SND_BUF in lwipopts.h
export const READABLE_HIGH_WATER_MARK = MAX_SEGMENT_SIZE;

export type TcpImports = {
  accept_tcp_connection(
    listenerHandle: TcpListenerHandle,
    connectionHandle: TcpConnectionHandle
  ): Promise<void>;
  connected_tcp_connection(handle: TcpConnectionHandle): Promise<void>;
  closed_tcp_connection(handle: TcpConnectionHandle): Promise<void>;
  receive_tcp_chunk(
    handle: TcpConnectionHandle,
    chunkPtr: number,
    length: number
  ): Promise<void>;
  sent_tcp_chunk(handle: TcpConnectionHandle, length: number): void;
};

export type TcpExports = {
  create_tcp_listener(host: Pointer | null, port: number): TcpListenerHandle;
  create_tcp_connection(host: Pointer, port: number): TcpConnectionHandle;
  close_tcp_connection(handle: TcpConnectionHandle): number;
  send_tcp_chunk(
    handle: TcpConnectionHandle,
    chunk: number,
    length: number
  ): number;
  update_tcp_receive_buffer(handle: TcpConnectionHandle, length: number): void;
};

export class TcpBindings extends Bindings<TcpImports, TcpExports> {
  #tcpListeners = new Map<TcpListenerHandle, TcpListener>();
  #tcpConnections = new EventMap<TcpConnectionHandle, TcpConnection>();
  #tcpAcks = new Map<TcpConnectionHandle, (length: number) => void>();
  #dnsClient: DnsClient;

  async #resolveHost(host: string) {
    try {
      return serializeIPv4Address(host);
    } catch (e) {
      const ip = await this.#dnsClient.lookup(host);
      return serializeIPv4Address(ip);
    }
  }

  constructor(dnsClient: DnsClient) {
    super();
    this.#dnsClient = dnsClient;
  }

  imports = {
    accept_tcp_connection: async (
      listenerHandle: TcpListenerHandle,
      connectionHandle: TcpConnectionHandle
    ) => {
      const listener = this.#tcpListeners.get(listenerHandle);

      if (!listener) {
        console.error('new tcp connection to unknown listener');
        return;
      }

      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      await nextMicrotask();

      const connection = new VirtualTcpConnection();

      tcpConnectionHooks.setOuter(connection, {
        send: async (data) => {
          const dataPtr = Number(this.copyToMemory(data));

          let bytesQueued = this.exports.send_tcp_chunk(
            connectionHandle,
            dataPtr,
            data.length
          );

          // If the entire data was not queued, send the remaining
          // chunks as space becomes available
          while (bytesQueued < data.length) {
            await new Promise<number>((resolve) => {
              this.#tcpAcks.set(connectionHandle, resolve);
            });
            const bytesRemaining = data.length - bytesQueued;

            bytesQueued += this.exports.send_tcp_chunk(
              connectionHandle,
              dataPtr + bytesQueued,
              bytesRemaining
            );
          }
        },
        updateReceiveBuffer: (length: number) => {
          this.exports.update_tcp_receive_buffer(connectionHandle, length);
        },
        close: async () => {
          const result = this.exports.close_tcp_connection(connectionHandle);

          if (result !== LwipError.ERR_OK) {
            throw new Error(`failed to close tcp connection: ${result}`);
          }
        },
      });

      this.#tcpConnections.set(connectionHandle, connection);

      tcpListenerHooks.getInner(listener).accept(connection);
    },
    connected_tcp_connection: async (handle: TcpConnectionHandle) => {
      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      await nextMicrotask();

      const connection = new VirtualTcpConnection();

      tcpConnectionHooks.setOuter(connection, {
        send: async (data) => {
          const dataPtr = Number(this.copyToMemory(data));

          let bytesQueued = this.exports.send_tcp_chunk(
            handle,
            dataPtr,
            data.length
          );

          // If the entire data was not queued, send the remaining
          // chunks as space becomes available
          while (bytesQueued < data.length) {
            await new Promise<number>((resolve) => {
              this.#tcpAcks.set(handle, resolve);
            });
            const bytesRemaining = data.length - bytesQueued;

            bytesQueued += this.exports.send_tcp_chunk(
              handle,
              dataPtr + bytesQueued,
              bytesRemaining
            );
          }
        },
        updateReceiveBuffer: (length: number) => {
          this.exports.update_tcp_receive_buffer(handle, length);
        },
        close: async () => {
          this.exports.close_tcp_connection(handle);
        },
      });

      this.#tcpConnections.set(handle, connection);
    },
    closed_tcp_connection: async (handle: TcpConnectionHandle) => {
      const connection = this.#tcpConnections.get(handle);

      if (!connection) {
        console.error('received close on unknown tcp connection');
        return;
      }

      await tcpConnectionHooks.getInner(connection).close();
    },
    receive_tcp_chunk: async (
      handle: TcpConnectionHandle,
      chunkPtr: number,
      length: number
    ) => {
      const chunk = this.copyFromMemory(chunkPtr, length);
      const connection = this.#tcpConnections.get(handle);

      if (!connection) {
        console.error('received chunk on unknown tcp connection');
        return;
      }

      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      await nextMicrotask();

      tcpConnectionHooks.getInner(connection).receive(new Uint8Array(chunk));
    },
    sent_tcp_chunk: (handle: TcpConnectionHandle, length: number) => {
      const notifyAck = this.#tcpAcks.get(handle);
      this.#tcpAcks.delete(handle);
      notifyAck?.(length);
    },
  };

  async listen(options: TcpListenerOptions) {
    using hostPtr = options.host
      ? this.copyToMemory(await this.#resolveHost(options.host))
      : null;

    const handle = this.exports.create_tcp_listener(hostPtr, options.port);

    const tcpListener = new VirtualTcpListener();

    tcpListenerHooks.setOuter(tcpListener, {});

    this.#tcpListeners.set(handle, tcpListener);

    return tcpListener;
  }

  async connect(options: TcpConnectionOptions) {
    using hostPtr = this.copyToMemory(await this.#resolveHost(options.host));

    const handle = this.exports.create_tcp_connection(hostPtr, options.port);

    const tcpConnection = await this.#tcpConnections.wait(handle);

    if (!tcpConnection) {
      throw new Error('tcp failed to connect');
    }

    return tcpConnection;
  }
}

export type TcpListenerOptions = {
  host?: string;
  port: number;
};

export type TcpListener = {
  [Symbol.asyncIterator](): AsyncIterableIterator<TcpConnection>;
};

export class VirtualTcpListener
  implements TcpListener, AsyncIterable<TcpConnection>
{
  #connections: TcpConnection[] = [];
  #notifyConnection?: () => void;

  constructor() {
    tcpListenerHooks.setInner(this, {
      accept: async (connection: TcpConnection) => {
        this.#connections.push(connection);
        this.#notifyConnection?.();
      },
    });
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<TcpConnection> {
    while (true) {
      await new Promise<void>((resolve) => {
        this.#notifyConnection = resolve;
      });

      yield* this.#connections;
      this.#connections = [];
    }
  }
}

export type TcpConnectionOptions = {
  host: string;
  port: number;
};

export type TcpConnection = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
};

export class VirtualTcpConnection
  implements TcpConnection, AsyncIterable<Uint8Array>
{
  #receiveBuffer: Uint8Array[] = [];
  #readableController?: ReadableStreamDefaultController<Uint8Array>;
  #writableController?: WritableStreamDefaultController;

  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  constructor() {
    tcpConnectionHooks.setInner(this, {
      receive: async (data: Uint8Array) => {
        // We maintain our own receive buffer prior to enqueueing to the readable
        // stream so that we can send window updates as data is consumed
        this.#receiveBuffer.push(data);
        this.#enqueueBuffer();
      },
      close: async () => {
        this.close();
      },
    });

    this.readable = new ReadableStream(
      {
        start: (controller) => {
          this.#readableController = controller;
        },
        pull: () => {
          this.#enqueueBuffer();
        },
      },
      {
        highWaterMark: READABLE_HIGH_WATER_MARK,
        size: (chunk) => chunk.byteLength,
      }
    );

    this.writable = new WritableStream(
      {
        start: (controller) => {
          this.#writableController = controller;
        },
        write: async (chunk) => {
          await tcpConnectionHooks.getOuter(this).send(chunk);
        },
      },
      {
        // Send buffer is managed by the TCP stack
        highWaterMark: 0,
      }
    );
  }

  #enqueueBuffer() {
    if (!this.#readableController?.desiredSize) {
      return;
    }

    let bytesEnqueued = 0;

    // Enqueue chunks until the desired size is reached
    while (this.#receiveBuffer.length > 0) {
      const chunkLength = this.#receiveBuffer[0]!.length;

      if (bytesEnqueued + chunkLength > this.#readableController.desiredSize) {
        break;
      }

      const chunk = this.#receiveBuffer.shift()!;
      this.#readableController.enqueue(chunk);
      bytesEnqueued += chunk.length;
    }

    // Notify the TCP stack that we've read the data
    if (bytesEnqueued > 0) {
      tcpConnectionHooks.getOuter(this).updateReceiveBuffer(bytesEnqueued);
    }
  }

  async close() {
    await tcpConnectionHooks.getOuter(this).close();
    this.#readableController?.error(new Error('tcp connection closed'));
    this.#writableController?.error(new Error('tcp connection closed'));
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    if (this.readable.locked) {
      throw new Error('readable stream already locked');
    }
    return fromReadable(this.readable);
  }
}
