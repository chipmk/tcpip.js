import {
  parseIPv4Address,
  serializeIPv4Cidr,
  type IPv4Address,
  type IPv4Cidr,
} from '@tcpip/wire';
import type { Pointer } from '../types.js';
import {
  ExtendedReadableStream,
  fromReadable,
  Hooks,
  nextMicrotask,
} from '../util.js';
import { Bindings } from './base.js';

type TunInterfaceHandle = Pointer;

type TunInterfaceOuterHooks = {
  handle: TunInterfaceHandle;
  sendPacket(packet: Uint8Array): void;
  getIPv4Address(): IPv4Address | undefined;
  getIPv4Netmask(): IPv4Address | undefined;
};

type TunInterfaceInnerHooks = {
  receivePacket(packet: Uint8Array): void;
};

const tunInterfaceHooks = new Hooks<
  TunInterface,
  TunInterfaceOuterHooks,
  TunInterfaceInnerHooks
>();

export type TunImports = {
  register_tun_interface(handle: TunInterfaceHandle): void;
  receive_packet(
    handle: TunInterfaceHandle,
    packetPtr: number,
    length: number
  ): Promise<void>;
};

export type TunExports = {
  create_tun_interface(
    ipAddress: Pointer,
    netmask: Pointer
  ): TunInterfaceHandle;
  remove_tun_interface(handle: TunInterfaceHandle): void;
  send_tun_interface(
    handle: TunInterfaceHandle,
    packet: Pointer,
    length: number
  ): void;
};

export class TunBindings extends Bindings<TunImports, TunExports> {
  interfaces = new Map<TunInterfaceHandle, TunInterface>();

  imports = {
    register_tun_interface: (handle: TunInterfaceHandle) => {
      const tunInterface = new VirtualTunInterface();

      tunInterfaceHooks.setOuter(tunInterface, {
        handle,
        sendPacket: (packet) => {
          const packetPtr = this.copyToMemory(packet);
          this.exports.send_tun_interface(handle, packetPtr, packet.length);
        },
        getIPv4Address: () => {
          const ipPtr = this.exports.get_interface_ip4_address(handle);

          if (ipPtr === 0) {
            return;
          }

          const ipBytes = this.viewFromMemory(ipPtr, 4);
          return parseIPv4Address(ipBytes);
        },
        getIPv4Netmask: () => {
          const netmaskPtr = this.exports.get_interface_ip4_netmask(handle);

          if (netmaskPtr === 0) {
            return;
          }

          const netmaskBytes = this.viewFromMemory(netmaskPtr, 4);
          return parseIPv4Address(netmaskBytes);
        },
      });

      this.interfaces.set(handle, tunInterface);
    },
    receive_packet: async (
      handle: TunInterfaceHandle,
      packetPtr: number,
      length: number
    ) => {
      const packet = this.copyFromMemory(packetPtr, length);

      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      // This also gives the consumer a chance to start listening before we enqueue the first packet
      await nextMicrotask();

      const tunInterface = this.interfaces.get(handle);

      if (!tunInterface) {
        console.error('received packet on unknown tun interface');
        return;
      }

      tunInterfaceHooks
        .getInner(tunInterface)
        .receivePacket(new Uint8Array(packet));
    },
  };

  async create(options: TunInterfaceOptions) {
    const { ipAddress, netmask } = options.ip
      ? serializeIPv4Cidr(options.ip)
      : {};

    using ipAddressPtr = ipAddress ? this.copyToMemory(ipAddress) : undefined;
    using netmaskPtr = netmask ? this.copyToMemory(netmask) : undefined;

    const handle = this.exports.create_tun_interface(
      ipAddressPtr ?? 0,
      netmaskPtr ?? 0
    );

    const tunInterface = this.interfaces.get(handle);

    if (!tunInterface) {
      throw new Error('tun interface failed to register');
    }

    return tunInterface;
  }

  async remove(tunInterface: TunInterface) {
    for (const [handle, loopback] of this.interfaces.entries()) {
      if (loopback === tunInterface) {
        this.exports.remove_tun_interface(handle);
        this.interfaces.delete(handle);
        return;
      }
    }
  }
}

export type TunInterfaceOptions = {
  ip?: IPv4Cidr;
};

export type TunInterface = {
  readonly type: 'tun';
  readonly ip?: IPv4Address;
  readonly netmask?: IPv4Address;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  listen(): AsyncIterableIterator<Uint8Array>;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
};

export class VirtualTunInterface implements TunInterface {
  #readableController?: ReadableStreamController<Uint8Array>;
  #isListening = false;

  readonly type = 'tun' as const;
  get ip(): IPv4Address | undefined {
    return tunInterfaceHooks.getOuter(this).getIPv4Address();
  }
  get netmask(): IPv4Address | undefined {
    return tunInterfaceHooks.getOuter(this).getIPv4Netmask();
  }
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  constructor() {
    tunInterfaceHooks.setInner(this, {
      receivePacket: async (packet: Uint8Array) => {
        // Do not buffer packets until the consumer signals intent
        // to listen - otherwise memory will grow indefinitely
        if (!this.#isListening) {
          return;
        }

        if (!this.#readableController) {
          throw new Error('readable stream not initialized');
        }

        this.#readableController?.enqueue(packet);
      },
    });

    this.readable = new ExtendedReadableStream<Uint8Array>({
      start: (controller) => {
        this.#readableController = controller;
      },
      lock: () => {
        // We interpret anything that locks the stream (getReader, pipeThrough, pipeTo, tee)
        // as intent to start listening
        this.#isListening = true;
      },
    });

    this.writable = new WritableStream({
      write: (packet) => {
        tunInterfaceHooks.getOuter(this).sendPacket(packet);
      },
    });
  }

  listen() {
    if (this.readable.locked) {
      throw new Error('readable stream already locked');
    }
    return fromReadable(this.readable);
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    return this.listen();
  }
}
