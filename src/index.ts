import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import { readFile } from 'node:fs/promises';
import { LwipError } from './lwip/errors.js';
import { serializeMacAddress, type MacAddress } from './protocols/ethernet.js';
import {
  serializeIPv4Address,
  serializeIPv4Cidr,
  type IPv4Address,
  type IPv4Cidr,
} from './protocols/ipv4.js';
import {
  EventMap,
  ExtendedReadableStream,
  fromReadable,
  Hooks,
  nextMicrotask,
  UniquePointer,
} from './util.js';

type Pointer = UniquePointer;

type LoopbackInterfaceHandle = Pointer;
type TunInterfaceHandle = Pointer;
type TapInterfaceHandle = Pointer;
type TcpListenerHandle = Pointer;
type TcpConnectionHandle = Pointer;

type WasiExports = {
  memory: WebAssembly.Memory;
  _start(): unknown;
};

type SysExports = {
  malloc(size: number): number;
  free(ptr: number): void;
};

type StackExports = {
  process_queued_packets(): void;
  process_timeouts(): void;
};

type LoopbackExports = {
  create_loopback_interface(
    ipAddress: Pointer,
    netmask: Pointer
  ): LoopbackInterfaceHandle;
};

type TunExports = {
  create_tun_interface(
    ipAddress: Pointer,
    netmask: Pointer
  ): TunInterfaceHandle;
  send_tun_interface(
    handle: TunInterfaceHandle,
    packet: Pointer,
    length: number
  ): void;
};

type TapExports = {
  create_tap_interface(
    macAddress: Pointer,
    ipAddress: Pointer,
    netmask: Pointer
  ): TapInterfaceHandle;
  send_tap_interface(
    handle: TapInterfaceHandle,
    frame: Pointer,
    length: number
  ): void;
};

type TcpExports = {
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

type WasmExports = WasiExports &
  SysExports &
  StackExports &
  LoopbackExports &
  TunExports &
  TapExports &
  TcpExports;

type WasmInstance = {
  exports: WasmExports;
};

export async function createStack() {
  const stack = new NetworkStack();
  await stack.ready;
  return stack;
}

export class NetworkStack {
  #instance?: WasmInstance;
  #loopIntervalId?: number;

  #loopbackInterfaces = new Map<LoopbackInterfaceHandle, LoopbackInterface>();
  #tunInterfaces = new Map<TunInterfaceHandle, TunInterface>();
  #tapInterfaces = new Map<TapInterfaceHandle, TapInterface>();

  #tcpListeners = new Map<TcpListenerHandle, TcpListener>();
  #tcpConnections = new EventMap<TcpConnectionHandle, TcpConnection>();
  #tcpAcks = new Map<TcpConnectionHandle, (length: number) => void>();

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
        receive_frame: async (
          handle: TapInterfaceHandle,
          framePtr: number,
          length: number
        ) => {
          const frame = this.#copyFromMemory(framePtr, length);

          // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
          // This also gives the consumer a chance to start listening before we enqueue the first frame
          await nextMicrotask();

          const tapInterface = this.#tapInterfaces.get(handle);

          if (!tapInterface) {
            console.error('received frame on unknown tap interface');
            return;
          }

          tapInterfaceHooks
            .getInner(tapInterface)
            .receiveFrame(new Uint8Array(frame));
        },
        receive_packet: async (
          handle: TunInterfaceHandle,
          packetPtr: number,
          length: number
        ) => {
          const packet = this.#copyFromMemory(packetPtr, length);

          // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
          // This also gives the consumer a chance to start listening before we enqueue the first packet
          await nextMicrotask();

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
              const packetPtr = this.#copyToMemory(packet);
              this.#bridge.send_tun_interface(handle, packetPtr, packet.length);
            },
          });

          this.#tunInterfaces.set(handle, tunInterface);
        },
        register_tap_interface: (handle: TapInterfaceHandle) => {
          const tapInterface = new TapInterface();

          tapInterfaceHooks.setOuter(tapInterface, {
            sendFrame: (frame) => {
              const framePtr = this.#copyToMemory(frame);
              this.#bridge.send_tap_interface(handle, framePtr, frame.length);
            },
          });

          this.#tapInterfaces.set(handle, tapInterface);
        },
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

          const connection = new TcpConnection();

          tcpConnectionHooks.setOuter(connection, {
            send: async (data) => {
              const dataPtr = Number(this.#copyToMemory(data));

              let bytesQueued = this.#bridge.send_tcp_chunk(
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

                bytesQueued += this.#bridge.send_tcp_chunk(
                  connectionHandle,
                  dataPtr + bytesQueued,
                  bytesRemaining
                );
              }
            },
            updateReceiveBuffer: (length: number) => {
              this.#bridge.update_tcp_receive_buffer(connectionHandle, length);
            },
            close: async () => {
              const result =
                this.#bridge.close_tcp_connection(connectionHandle);

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

          const connection = new TcpConnection();

          tcpConnectionHooks.setOuter(connection, {
            send: async (data) => {
              const dataPtr = Number(this.#copyToMemory(data));

              let bytesQueued = this.#bridge.send_tcp_chunk(
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

                bytesQueued += this.#bridge.send_tcp_chunk(
                  handle,
                  dataPtr + bytesQueued,
                  bytesRemaining
                );
              }
            },
            updateReceiveBuffer: (length: number) => {
              this.#bridge.update_tcp_receive_buffer(handle, length);
            },
            close: async () => {
              this.#bridge.close_tcp_connection(handle);
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
          const chunk = this.#copyFromMemory(chunkPtr, length);
          const connection = this.#tcpConnections.get(handle);

          if (!connection) {
            console.error('received chunk on unknown tcp connection');
            return;
          }

          // Wait for synchronous lwIP operations to complete to prevent reentrancy issues
          await nextMicrotask();

          tcpConnectionHooks
            .getInner(connection)
            .receive(new Uint8Array(chunk));
        },
        sent_tcp_chunk: (handle: TcpConnectionHandle, length: number) => {
          const notifyAck = this.#tcpAcks.get(handle);
          this.#tcpAcks.delete(handle);
          notifyAck?.(length);
        },
      },
    });

    this.#instance = instance as WasmInstance;
    wasi.start(this.#instance);

    // Call lwIP's main loop regularly (required in NO_SYS mode)
    // Used to process queued packets (eg. loopback) and expired timeouts
    this.#loopIntervalId = Number(
      setInterval(() => {
        this.#bridge.process_queued_packets();
        this.#bridge.process_timeouts();
      }, 100)
    );
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

    const { ipAddress, netmask } = serializeIPv4Cidr(options.ip);

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

    const macAddress = serializeMacAddress(options.mac);
    const { ipAddress, netmask } = serializeIPv4Cidr(options.ip);

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

  async listenTcp(options: TcpListenerOptions): Promise<TcpListener> {
    await this.ready;

    using hostPtr = options.host
      ? this.#copyToMemory(serializeIPv4Address(options.host))
      : null;

    const handle = this.#bridge.create_tcp_listener(hostPtr, options.port);

    const tcpListener = new TcpListener();

    tcpListenerHooks.setOuter(tcpListener, {});

    this.#tcpListeners.set(handle, tcpListener);

    return tcpListener;
  }

  async connectTcp(options: TcpConnectionOptions): Promise<TcpConnection> {
    await this.ready;

    using hostPtr = this.#copyToMemory(serializeIPv4Address(options.host));

    const handle = this.#bridge.create_tcp_connection(hostPtr, options.port);

    const tcpConnection = await this.#tcpConnections.wait(handle);

    if (!tcpConnection) {
      throw new Error('tcp failed to connect');
    }

    return tcpConnection;
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
  ip: IPv4Cidr;
};

export class TunInterface {
  #readableController?: ReadableStreamController<Uint8Array>;
  #isListening = false;

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
  mac: MacAddress;
  ip: IPv4Cidr;
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

        this.#readableController?.enqueue(frame);
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
        tapInterfaceHooks.getOuter(this).sendFrame(packet);
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

type TcpListenerOuterHooks = {};

type TcpListenerInnerHooks = {
  accept(connection: TcpConnection): void;
};

const tcpListenerHooks = new Hooks<
  TcpListener,
  TcpListenerOuterHooks,
  TcpListenerInnerHooks
>();

export type TcpListenerOptions = {
  host?: IPv4Address;
  port: number;
};

export class TcpListener implements AsyncIterable<TcpConnection> {
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

type TcpConnectionOuterHooks = {
  send(data: Uint8Array): Promise<void>;
  updateReceiveBuffer(length: number): void;
  close(): Promise<void>;
};

type TcpConnectionInnerHooks = {
  receive(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
};

const tcpConnectionHooks = new Hooks<
  TcpConnection,
  TcpConnectionOuterHooks,
  TcpConnectionInnerHooks
>();

export const MAX_SEGMENT_SIZE = 1460; // This must match TCP_MSS in lwipopts.h
export const MAX_WINDOW_SIZE = MAX_SEGMENT_SIZE * 4; // This must match TCP_WND in lwipopts.h
export const SEND_BUFFER_SIZE = MAX_SEGMENT_SIZE * 4; // This must match TCP_SND_BUF in lwipopts.h
export const READABLE_HIGH_WATER_MARK = MAX_SEGMENT_SIZE;

export type TcpConnectionOptions = {
  host: IPv4Address;
  port: number;
};

export class TcpConnection implements AsyncIterable<Uint8Array> {
  #receiveBuffer: Uint8Array[] = [];
  #readableController?: ReadableStreamDefaultController<Uint8Array>;

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
        // TODO: separate readable and writable close logic
        cancel: () => {
          this.close();
        },
      },
      {
        highWaterMark: READABLE_HIGH_WATER_MARK,
        size: (chunk) => chunk.byteLength,
      }
    );

    this.writable = new WritableStream(
      {
        write: async (chunk) => {
          await tcpConnectionHooks.getOuter(this).send(chunk);
        },
        // TODO: separate readable and writable close logic
        close: async () => {
          this.close();
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
    await this.readable.cancel();
    await this.writable.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    if (this.readable.locked) {
      throw new Error('readable stream already locked');
    }
    return fromReadable(this.readable);
  }
}
