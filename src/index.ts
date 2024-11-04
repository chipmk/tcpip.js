import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import { readFile } from 'node:fs/promises';
import { serializeMacAddress, type MacAddress } from './protocols/ethernet.js';
import { serializeIPv4Cidr, type IPv4Cidr } from './protocols/ipv4.js';
import { Hooks } from './util.js';

type Pointer = number;
type TapInterfaceHandle = Pointer;

type WasmInstance = {
  exports: {
    // WASI
    memory: WebAssembly.Memory;
    _start(): unknown;

    // Sys
    malloc(size: number): Pointer;
    free(ptr: Pointer): void;

    // Lib
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

  #copyToMemory(data: Uint8Array): Pointer {
    const length = data.length;
    const pointer = this.#bridge.malloc(length);

    const memoryView = new Uint8Array(
      this.#bridge.memory.buffer,
      pointer,
      length
    );

    memoryView.set(data);

    return pointer;
  }

  #copyFromMemory(ptr: Pointer, length: number): Uint8Array {
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
          framePtr: Pointer,
          length: number
        ) => {
          const frame = this.#copyFromMemory(framePtr, length);
          const tapInterface = this.#tapInterfaces.get(handle);

          // console.log('received frame', parseEthernetFrame(frame));

          if (!tapInterface) {
            console.error('received frame on unknown tap interface');
            return;
          }

          tapInterfaceHooks
            .getInner(tapInterface)
            .receiveFrame(new Uint8Array(frame));
        },
        register_tap_interface: (handle: TapInterfaceHandle) => {
          const tapInterface = new TapInterface();

          tapInterfaceHooks.setOuter(tapInterface, {
            sendFrame: (frame) => {
              const framePtr = this.#copyToMemory(frame);
              this.#bridge.send_tap_interface(handle, framePtr, frame.length);
              this.#bridge.free(framePtr);
            },
          });

          this.#tapInterfaces.set(handle, tapInterface);
        },
      },
    });

    this.#instance = instance as WasmInstance;
    wasi.start(this.#instance);
  }

  async createTapInterface(
    options: TapInterfaceOptions
  ): Promise<TapInterface> {
    await this.ready;

    const macAddress = serializeMacAddress(options.macAddress);
    const { ipAddress, netmask } = serializeIPv4Cidr(options.cidr);

    const macAddressPtr = this.#copyToMemory(macAddress);
    const ipAddressPtr = this.#copyToMemory(ipAddress);
    const netmaskPtr = this.#copyToMemory(netmask);

    const handle = this.#bridge.create_tap_interface(
      macAddressPtr,
      ipAddressPtr,
      netmaskPtr
    );

    this.#bridge.free(macAddressPtr);
    this.#bridge.free(ipAddressPtr);
    this.#bridge.free(netmaskPtr);

    const tapInterface = this.#tapInterfaces.get(handle);

    if (!tapInterface) {
      throw new Error('tap interface failed to register');
    }

    return tapInterface;
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
