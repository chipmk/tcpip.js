import { LwipError } from '../lwip/errors.js';
import {
  parseIPv4Address,
  serializeIPv4Address,
  type IPv4Address,
} from '../protocols/ipv4.js';
import type { Pointer } from '../types.js';
import { EventMap, fromReadable, Hooks, nextMicrotask } from '../util.js';
import { Bindings } from './base.js';

export type UdpDatagram = {
  host: IPv4Address;
  port: number;
  data: Uint8Array;
};

type UdpConnectionHandle = Pointer;

type UdpConnectionOuterHooks = {
  send(datagram: UdpDatagram): Promise<void>;
  close(): Promise<void>;
};

type UdpConnectionInnerHooks = {
  receive(datagram: UdpDatagram): Promise<void>;
};

const UdpConnectionHooks = new Hooks<
  UdpConnection,
  UdpConnectionOuterHooks,
  UdpConnectionInnerHooks
>();

export type UdpImports = {
  receive_udp_datagram(
    handle: UdpConnectionHandle,
    ip: number,
    port: number,
    datagramPtr: number,
    length: number
  ): Promise<void>;
};

export type UdpExports = {
  open_udp_connection(
    host: Pointer | null,
    port: number,
    allow_broadcast: boolean
  ): UdpConnectionHandle;
  close_udp_connection(handle: UdpConnectionHandle): void;
  send_udp_datagram(
    handle: UdpConnectionHandle,
    ip: Pointer | null,
    port: number,
    datagram: Pointer,
    length: number
  ): number;
};

export class UdpBindings extends Bindings<UdpImports, UdpExports> {
  #udpConnections = new EventMap<UdpConnectionHandle, UdpConnection>();

  imports = {
    receive_udp_datagram: async (
      handle: UdpConnectionHandle,
      hostPtr: number,
      port: number,
      datagramPtr: number,
      length: number
    ) => {
      const host = this.copyFromMemory(hostPtr, 4);
      const datagram = this.copyFromMemory(datagramPtr, length);
      const connection = this.#udpConnections.get(handle);

      if (!connection) {
        console.error('received datagram on unknown udp connection');
        return;
      }

      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      await nextMicrotask();

      UdpConnectionHooks.getInner(connection).receive({
        host: parseIPv4Address(host),
        port,
        data: datagram,
      });
    },
  };

  async open(options: UdpConnectionOptions) {
    using hostPtr = options.host
      ? this.copyToMemory(serializeIPv4Address(options.host))
      : null;

    const handle = this.exports.open_udp_connection(
      hostPtr,
      options.port ?? 0,
      options.allowBroadcast ?? false
    );

    const udpConnection = new UdpConnection();

    UdpConnectionHooks.setOuter(udpConnection, {
      send: async (datagram: UdpDatagram) => {
        using hostPtr = this.copyToMemory(serializeIPv4Address(datagram.host));
        using datagramPtr = this.copyToMemory(datagram.data);

        const result = this.exports.send_udp_datagram(
          handle,
          hostPtr,
          datagram.port,
          datagramPtr,
          datagram.data.length
        );

        if (result !== LwipError.ERR_OK) {
          throw new Error(`failed to send udp datagram: ${result}`);
        }
      },
      close: async () => {
        this.exports.close_udp_connection(handle);
        this.#udpConnections.delete(handle);
      },
    });

    this.#udpConnections.set(handle, udpConnection);

    return udpConnection;
  }
}

export type UdpConnectionOptions = {
  /**
   * The local host to bind to.
   *
   * If not provided, the connection will bind to all available interfaces.
   */
  host?: IPv4Address;

  /**
   * The local port to bind to.
   *
   * If not provided, the connection will bind to a random port.
   */
  port?: number;

  /**
   * Whether to allow sending and receiving from broadcast IP addresses.
   */
  allowBroadcast?: boolean;
};

export class UdpConnection implements AsyncIterable<UdpDatagram> {
  #readableController?: ReadableStreamDefaultController<UdpDatagram>;
  #writableController?: WritableStreamDefaultController;

  readable: ReadableStream<UdpDatagram>;
  writable: WritableStream<UdpDatagram>;

  constructor() {
    UdpConnectionHooks.setInner(this, {
      receive: async (datagram: UdpDatagram) => {
        if (!this.#readableController) {
          throw new Error('readable controller not initialized');
        }
        this.#readableController.enqueue(datagram);
      },
    });

    this.readable = new ReadableStream({
      start: (controller) => {
        this.#readableController = controller;
      },
    });

    this.writable = new WritableStream({
      start: (controller) => {
        this.#writableController = controller;
      },
      write: async (datagram) => {
        await UdpConnectionHooks.getOuter(this).send(datagram);
      },
    });
  }

  async close() {
    await UdpConnectionHooks.getOuter(this).close();
    this.#readableController?.error(new Error('udp connection closed'));
    this.#writableController?.error(new Error('udp connection closed'));
  }

  [Symbol.asyncIterator](): AsyncIterator<UdpDatagram> {
    if (this.readable.locked) {
      throw new Error('readable stream already locked');
    }
    return fromReadable(this.readable);
  }
}
