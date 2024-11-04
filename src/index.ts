import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import { readFile } from 'node:fs/promises';
import { serializeMacAddress, type MacAddress } from './protocols/ethernet.js';
import { serializeIPv4Cidr, type IPv4Cidr } from './protocols/ipv4.js';
import { Hooks, UniquePointer } from './util.js';

type Pointer = UniquePointer;

type LoopbackInterfaceHandle = Pointer;
type TunInterfaceHandle = Pointer;
type TapInterfaceHandle = Pointer;

type WasmInstance = {
  exports: {
    // WASI
    memory: WebAssembly.Memory;
    _start(): unknown;

    // Sys
    malloc(size: number): number;
    free(ptr: number): void;

    // Loopback interface
    create_loopback_interface(
      ipAddress: Pointer,
      netmask: Pointer
    ): LoopbackInterfaceHandle;

    // Tun interface
    create_tun_interface(
      ipAddress: Pointer,
      netmask: Pointer
    ): TunInterfaceHandle;
    send_tun_interface(
      handle: TunInterfaceHandle,
      packet: Pointer,
      size: number
    ): void;

    // Tap interface
    create_tap_interface(
      macAddress: Pointer,
      ipAddress: Pointer,
      netmask: Pointer
    ): TapInterfaceHandle;
    send_tap_interface(
      handle: TapInterfaceHandle,
      frame: Pointer,
      size: number
    ): void;
  };
};

export async function createStack() {
  const stack = new NetworkStack();
  await stack.ready;
  return stack;
}

export class NetworkStack {
  #instance?: WasmInstance;

  #loopbackInterfaces = new Map<LoopbackInterfaceHandle, LoopbackInterface>();
  #tunInterfaces = new Map<TunInterfaceHandle, TunInterface>();
  #tapInterfaces = new Map<TapInterfaceHandle, TapInterface>();

  ready: Promise<void>;

  constructor() {
    this.ready = this.#init();
  }

  get #bridge() {
    if (!this.#instance) {
      throw new Error('network stack not initialized');
    }

    return this.#instance.exports;
  }

  #smartMalloc(size: number) {
    return new UniquePointer(this.#bridge.malloc(size), this.#bridge.free);
  }

  #copyToMemory(data: Uint8Array) {
    const length = data.length;
    const pointer = this.#smartMalloc(length);

    const memoryView = new Uint8Array(
      this.#bridge.memory.buffer,
      pointer.valueOf(),
      length
    );

    memoryView.set(data);

    return pointer;
  }

  #copyFromMemory(ptr: number, length: number): Uint8Array {
    const buffer = this.#bridge.memory.buffer.slice(ptr, ptr + length);
    return new Uint8Array(buffer);
  }

  async #init() {
    const wasi = new WASI(
      [],
      [],
      [
        new OpenFile(new File([])), // stdin
        ConsoleStdout.lineBuffered((msg) =>
          console.log(`[WASI stdout] ${msg}`)
        ),
        ConsoleStdout.lineBuffered((msg) =>
          console.warn(`[WASI stderr] ${msg}`)
        ),
      ]
    );

    const wasmBytes = await readFile(new URL('../tcpip.wasm', import.meta.url));
    const wasmModule = await WebAssembly.compile(wasmBytes);

    // Instantiate with both WASI and custom imports
    const instance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: {
        receive_frame: (
          handle: TapInterfaceHandle,
          framePtr: number,
          length: number
        ) => {
          const frame = this.#copyFromMemory(framePtr, length);
          const tapInterface = this.#tapInterfaces.get(handle);

          if (!tapInterface) {
            console.error('received frame on unknown tap interface');
            return;
          }

          tapInterfaceHooks
            .getInner(tapInterface)
            .receiveFrame(new Uint8Array(frame));
        },
        receive_packet: (
          handle: TunInterfaceHandle,
          packetPtr: number,
          length: number
        ) => {
          const packet = this.#copyFromMemory(packetPtr, length);
          const tunInterface = this.#tunInterfaces.get(handle);

          if (!tunInterface) {
            console.error('received packet on unknown tun interface');
            return;
          }

          tunInterfaceHooks
            .getInner(tunInterface)
            .receivePacket(new Uint8Array(packet));
        },
        register_loopback_interface: (handle: LoopbackInterfaceHandle) => {
          const loopbackInterface = new LoopbackInterface();
          this.#loopbackInterfaces.set(handle, loopbackInterface);
        },
        register_tun_interface: (handle: TunInterfaceHandle) => {
          const tunInterface = new TunInterface();

          tunInterfaceHooks.setOuter(tunInterface, {
            sendPacket: (packet) => {
              using packetPtr = this.#copyToMemory(packet);
              this.#bridge.send_tun_interface(handle, packetPtr, packet.length);
            },
          });

          this.#tunInterfaces.set(handle, tunInterface);
        },
        register_tap_interface: (handle: TapInterfaceHandle) => {
          const tapInterface = new TapInterface();

          tapInterfaceHooks.setOuter(tapInterface, {
            sendFrame: (frame) => {
              using framePtr = this.#copyToMemory(frame);
              this.#bridge.send_tap_interface(handle, framePtr, frame.length);
            },
          });

          this.#tapInterfaces.set(handle, tapInterface);
        },
      },
    });

    this.#instance = instance as WasmInstance;
    wasi.start(this.#instance);
  }

  async createLoopbackInterface(
    options: LoopbackInterfaceOptions
  ): Promise<LoopbackInterface> {
    await this.ready;

    const { ipAddress, netmask } = serializeIPv4Cidr(options.cidr);

    using ipAddressPtr = this.#copyToMemory(ipAddress);
    using netmaskPtr = this.#copyToMemory(netmask);

    const handle = this.#bridge.create_loopback_interface(
      ipAddressPtr,
      netmaskPtr
    );

    const loopbackInterface = this.#loopbackInterfaces.get(handle);

    if (!loopbackInterface) {
      throw new Error('loopback interface failed to register');
    }

    return loopbackInterface;
  }

  async createTunInterface(
    options: TunInterfaceOptions
  ): Promise<TunInterface> {
    await this.ready;

    const { ipAddress, netmask } = serializeIPv4Cidr(options.cidr);

    using ipAddressPtr = this.#copyToMemory(ipAddress);
    using netmaskPtr = this.#copyToMemory(netmask);

    const handle = this.#bridge.create_tun_interface(ipAddressPtr, netmaskPtr);

    const tunInterface = this.#tunInterfaces.get(handle);

    if (!tunInterface) {
      throw new Error('tun interface failed to register');
    }

    return tunInterface;
  }

  async createTapInterface(
    options: TapInterfaceOptions
  ): Promise<TapInterface> {
    await this.ready;

    const macAddress = serializeMacAddress(options.macAddress);
    const { ipAddress, netmask } = serializeIPv4Cidr(options.cidr);

    using macAddressPtr = this.#copyToMemory(macAddress);
    using ipAddressPtr = this.#copyToMemory(ipAddress);
    using netmaskPtr = this.#copyToMemory(netmask);

    const handle = this.#bridge.create_tap_interface(
      macAddressPtr,
      ipAddressPtr,
      netmaskPtr
    );

    const tapInterface = this.#tapInterfaces.get(handle);

    if (!tapInterface) {
      throw new Error('tap interface failed to register');
    }

    return tapInterface;
  }
}

export type LoopbackInterfaceOptions = {
  cidr: IPv4Cidr;
};
export class LoopbackInterface {}

type TunInterfaceOuterHooks = {
  sendPacket(packet: Uint8Array): void;
};

type TunInterfaceInnerHooks = {
  receivePacket(packet: Uint8Array): void;
};

const tunInterfaceHooks = new Hooks<
  TunInterface,
  TunInterfaceOuterHooks,
  TunInterfaceInnerHooks
>();

export type TunInterfaceOptions = {
  cidr: IPv4Cidr;
};

export class TunInterface {
  #buffer: Uint8Array[] = [];
  #notifyPacket?: () => void;
  #isListening = false;

  constructor() {
    tunInterfaceHooks.setInner(this, {
      receivePacket: async (packet: Uint8Array) => {
        // Do not buffer packets if not listening
        // since memory will grow indefinitely
        if (!this.#isListening) {
          return;
        }

        this.#buffer.push(packet);
        this.#notifyPacket?.();
      },
    });
  }

  async send(packet: Uint8Array) {
    tunInterfaceHooks.getOuter(this).sendPacket(packet);
  }

  listen() {
    if (this.#isListening) {
      throw new Error('already listening');
    }

    this.#isListening = true;
    return this.#listen();
  }

  async *#listen(): AsyncIterableIterator<Uint8Array> {
    try {
      if (this.#buffer.length > 0) {
        yield* this.#buffer;
        this.#buffer = [];
      }

      while (true) {
        await new Promise<void>((resolve) => {
          this.#notifyPacket = resolve;
        });

        yield* this.#buffer;
        this.#buffer = [];
      }
    } finally {
      this.#isListening = false;
      this.#buffer = [];
    }
  }
}

type TapInterfaceOuterHooks = {
  sendFrame(frame: Uint8Array): void;
};

type TapInterfaceInnerHooks = {
  receiveFrame(frame: Uint8Array): void;
};

const tapInterfaceHooks = new Hooks<
  TapInterface,
  TapInterfaceOuterHooks,
  TapInterfaceInnerHooks
>();

export type TapInterfaceOptions = {
  macAddress: MacAddress;
  cidr: IPv4Cidr;
};

export class TapInterface {
  #buffer: Uint8Array[] = [];
  #notifyFrame?: () => void;
  #isListening = false;

  constructor() {
    tapInterfaceHooks.setInner(this, {
      receiveFrame: async (frame: Uint8Array) => {
        // Do not buffer frames if not listening
        // since memory will grow indefinitely
        if (!this.#isListening) {
          return;
        }

        this.#buffer.push(frame);
        this.#notifyFrame?.();
      },
    });
  }

  async send(frame: Uint8Array) {
    tapInterfaceHooks.getOuter(this).sendFrame(frame);
  }

  listen() {
    if (this.#isListening) {
      throw new Error('already listening');
    }

    this.#isListening = true;
    return this.#listen();
  }

  async *#listen(): AsyncIterableIterator<Uint8Array> {
    try {
      if (this.#buffer.length > 0) {
        yield* this.#buffer;
        this.#buffer = [];
      }

      while (true) {
        await new Promise<void>((resolve) => {
          this.#notifyFrame = resolve;
        });

        yield* this.#buffer;
        this.#buffer = [];
      }
    } finally {
      this.#isListening = false;
      this.#buffer = [];
    }
  }
}
