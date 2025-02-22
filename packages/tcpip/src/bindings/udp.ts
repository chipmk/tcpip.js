import type { DnsClient } from '@tcpip/dns';
import {
  type IPv4Address,
  parseIPv4Address,
  serializeIPv4Address,
} from '@tcpip/wire';
import { LwipError } from '../lwip/errors.js';
import type { Pointer } from '../types.js';
import { EventMap, fromReadable, Hooks, nextMicrotask } from '../util.js';
import { Bindings } from './base.js';

export type UdpDatagram = {
  host: string;
  port: number;
  data: Uint8Array;
};

type UdpSocketHandle = Pointer;

type UdpSocketOuterHooks = {
  send(datagram: UdpDatagram): Promise<void>;
  close(): Promise<void>;
};

type UdpSocketInnerHooks = {
  receive(datagram: UdpDatagram): Promise<void>;
};

const udpSocketHooks = new Hooks<
  UdpSocket,
  UdpSocketOuterHooks,
  UdpSocketInnerHooks
>();

export type UdpImports = {
  receive_udp_datagram(
    handle: UdpSocketHandle,
    ip: number,
    port: number,
    datagramPtr: number,
    length: number
  ): Promise<void>;
};

export type UdpExports = {
  open_udp_socket(host: Pointer | null, port: number): UdpSocketHandle;
  close_udp_socket(handle: UdpSocketHandle): void;
  send_udp_datagram(
    handle: UdpSocketHandle,
    ip: Pointer | null,
    port: number,
    datagram: Pointer,
    length: number
  ): number;
};

export class UdpBindings extends Bindings<UdpImports, UdpExports> {
  #udpSockets = new EventMap<UdpSocketHandle, UdpSocket>();
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
    receive_udp_datagram: async (
      handle: UdpSocketHandle,
      hostPtr: number,
      port: number,
      datagramPtr: number,
      length: number
    ) => {
      const host = this.copyFromMemory(hostPtr, 4);
      const datagram = this.copyFromMemory(datagramPtr, length);
      const socket = this.#udpSockets.get(handle);

      if (!socket) {
        console.error('received datagram on unknown udp socket');
        return;
      }

      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      await nextMicrotask();

      udpSocketHooks.getInner(socket).receive({
        host: parseIPv4Address(host),
        port,
        data: datagram,
      });
    },
  };

  async open(options: UdpSocketOptions) {
    using hostPtr = options.host
      ? this.copyToMemory(await this.#resolveHost(options.host))
      : null;

    const handle = this.exports.open_udp_socket(hostPtr, options.port ?? 0);

    if (Number(handle) === 0) {
      throw new Error('failed to open udp socket');
    }

    const udpSocket = new VirtualUdpSocket();

    udpSocketHooks.setOuter(udpSocket, {
      send: async (datagram: UdpDatagram) => {
        using hostPtr = this.copyToMemory(
          await this.#resolveHost(datagram.host)
        );
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
        this.exports.close_udp_socket(handle);
        this.#udpSockets.delete(handle);
      },
    });

    this.#udpSockets.set(handle, udpSocket);

    return udpSocket;
  }
}

export type UdpSocketOptions = {
  /**
   * The local host to bind to.
   *
   * If not provided, the socket will bind to all available interfaces.
   */
  host?: string;

  /**
   * The local port to bind to.
   *
   * If not provided, the socket will bind to a random port.
   */
  port?: number;
};

export type UdpSocket = {
  readable: ReadableStream<UdpDatagram>;
  writable: WritableStream<UdpDatagram>;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<UdpDatagram>;
};

export class VirtualUdpSocket implements UdpSocket, AsyncIterable<UdpDatagram> {
  #readableController?: ReadableStreamDefaultController<UdpDatagram>;
  #writableController?: WritableStreamDefaultController;

  readable: ReadableStream<UdpDatagram>;
  writable: WritableStream<UdpDatagram>;

  constructor() {
    udpSocketHooks.setInner(this, {
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
        await udpSocketHooks.getOuter(this).send(datagram);
      },
    });
  }

  async close() {
    await udpSocketHooks.getOuter(this).close();
    this.#readableController?.error(new Error('udp socket closed'));
    this.#writableController?.error(new Error('udp socket closed'));
  }

  [Symbol.asyncIterator](): AsyncIterator<UdpDatagram> {
    if (this.readable.locked) {
      throw new Error('readable stream already locked');
    }
    return fromReadable(this.readable);
  }
}
