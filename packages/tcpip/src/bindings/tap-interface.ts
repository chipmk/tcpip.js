import { LwipError } from '../lwip/errors.js';
import { serializeMacAddress, type MacAddress } from '../protocols/ethernet.js';
import { serializeIPv4Cidr, type IPv4Cidr } from '../protocols/ipv4.js';
import type { Pointer } from '../types.js';
import {
  ExtendedReadableStream,
  fromReadable,
  generateMacAddress,
  Hooks,
  nextMicrotask,
} from '../util.js';
import { Bindings } from './base.js';

type TapInterfaceHandle = Pointer;

type TapInterfaceOuterHooks = {
  handle: TapInterfaceHandle;
  sendFrame(frame: Uint8Array): void;
};

type TapInterfaceInnerHooks = {
  receiveFrame(frame: Uint8Array): void;
};

export const tapInterfaceHooks = new Hooks<
  TapInterface,
  TapInterfaceOuterHooks,
  TapInterfaceInnerHooks
>();

export type TapImports = {
  register_tap_interface(handle: TapInterfaceHandle): void;
  receive_frame(
    handle: TapInterfaceHandle,
    framePtr: number,
    length: number
  ): Promise<void>;
};

export type TapExports = {
  create_tap_interface(
    macAddress: Pointer,
    ipAddress: Pointer,
    netmask: Pointer
  ): TapInterfaceHandle;
  remove_tap_interface(handle: TapInterfaceHandle): void;
  send_tap_interface(
    handle: TapInterfaceHandle,
    frame: Pointer,
    length: number
  ): number;
  enable_tap_interface(handle: TapInterfaceHandle): void;
  disable_tap_interface(handle: TapInterfaceHandle): void;
};

export class TapBindings extends Bindings<TapImports, TapExports> {
  interfaces = new Map<TapInterfaceHandle, TapInterface>();

  imports = {
    register_tap_interface: (handle: TapInterfaceHandle) => {
      const tapInterface = new TapInterface();

      tapInterfaceHooks.setOuter(tapInterface, {
        handle,
        sendFrame: (frame) => {
          const framePtr = this.copyToMemory(frame);
          const result = this.exports.send_tap_interface(
            handle,
            framePtr,
            frame.length
          );

          if (result !== LwipError.ERR_OK) {
            throw new Error(`failed to send frame: ${result}`);
          }
        },
      });

      this.interfaces.set(handle, tapInterface);
    },
    receive_frame: async (
      handle: TapInterfaceHandle,
      framePtr: number,
      length: number
    ) => {
      const frame = this.copyFromMemory(framePtr, length);

      // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
      // This also gives the consumer a chance to start listening before we enqueue the first frame
      await nextMicrotask();

      const tapInterface = this.interfaces.get(handle);

      if (!tapInterface) {
        console.error('received frame on unknown tap interface');
        return;
      }

      tapInterfaceHooks
        .getInner(tapInterface)
        .receiveFrame(new Uint8Array(frame));
    },
  };

  async create(options: TapInterfaceOptions) {
    const macAddress = options.mac
      ? serializeMacAddress(options.mac)
      : generateMacAddress();

    const { ipAddress, netmask } = options.ip
      ? serializeIPv4Cidr(options.ip)
      : {};

    using macAddressPtr = this.copyToMemory(macAddress);
    using ipAddressPtr = ipAddress ? this.copyToMemory(ipAddress) : undefined;
    using netmaskPtr = netmask ? this.copyToMemory(netmask) : undefined;

    const handle = this.exports.create_tap_interface(
      macAddressPtr,
      ipAddressPtr ?? 0,
      netmaskPtr ?? 0
    );

    const tapInterface = this.interfaces.get(handle);

    if (!tapInterface) {
      throw new Error('tap interface failed to register');
    }

    return tapInterface;
  }

  async remove(tapInterface: TapInterface) {
    for (const [handle, loopback] of this.interfaces.entries()) {
      if (loopback === tapInterface) {
        this.exports.remove_tap_interface(handle);
        this.interfaces.delete(handle);
        return;
      }
    }
  }
}

export type TapInterfaceOptions = {
  mac?: MacAddress;
  ip?: IPv4Cidr;
};

export class TapInterface {
  #readableController?: ReadableStreamController<Uint8Array>;
  #isListening = false;

  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  constructor() {
    tapInterfaceHooks.setInner(this, {
      receiveFrame: async (frame: Uint8Array) => {
        // Do not buffer frames until the consumer signals intent
        // to listen - otherwise memory will grow indefinitely
        if (!this.#isListening) {
          return;
        }

        if (!this.#readableController) {
          throw new Error('readable stream not initialized');
        }

        this.#readableController.enqueue(frame);
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
        try {
          tapInterfaceHooks.getOuter(this).sendFrame(packet);
        } catch (err) {
          console.log('tap interface send failed', err);
        }
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
