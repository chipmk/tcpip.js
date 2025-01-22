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

type UdpSocketHandle = Pointer;

type UdpSocketOuterHooks = {
  send(datagram: UdpDatagram): Promise<void>;
  close(): Promise<void>;
};

type UdpSocketInnerHooks = {
  receive(datagram: UdpDatagram): Promise<void>;
};

const UdpSocketHooks = new Hooks<
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
  #UdpSockets = new EventMap<UdpSocketHandle, UdpSocket>();

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
      const socket = this.#UdpSockets.get(handle);

      if (!socket) {
        console.error('received datagram on unknown udp socket');
        return;
      }

      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      await nextMicrotask();

      UdpSocketHooks.getInner(socket).receive({
        host: parseIPv4Address(host),
        port,
        data: datagram,
      });
    },
  };

  async open(options: UdpSocketOptions) {
    using hostPtr = options.host
      ? this.copyToMemory(serializeIPv4Address(options.host))
      : null;

    const handle = this.exports.open_udp_socket(hostPtr, options.port ?? 0);

    const udpSocket = new UdpSocket();

    UdpSocketHooks.setOuter(udpSocket, {
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
        this.exports.close_udp_socket(handle);
        this.#UdpSockets.delete(handle);
      },
    });

    this.#UdpSockets.set(handle, udpSocket);

    return udpSocket;
  }
}

export type UdpSocketOptions = {
  /**
   * The local host to bind to.
   *
   * If not provided, the socket will bind to all available interfaces.
   */
  host?: IPv4Address;

  /**
   * The local port to bind to.
   *
   * If not provided, the socket will bind to a random port.
   */
  port?: number;
};

export class UdpSocket implements AsyncIterable<UdpDatagram> {
  #readableController?: ReadableStreamDefaultController<UdpDatagram>;
  #writableController?: WritableStreamDefaultController;

  readable: ReadableStream<UdpDatagram>;
  writable: WritableStream<UdpDatagram>;

  constructor() {
    UdpSocketHooks.setInner(this, {
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
        await UdpSocketHooks.getOuter(this).send(datagram);
      },
    });
  }

  async close() {
    await UdpSocketHooks.getOuter(this).close();
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
