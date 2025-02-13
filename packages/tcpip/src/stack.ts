import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import {
  BridgeBindings,
  type BridgeInterfaceOptions,
} from './bindings/bridge-interface.js';
import {
  LoopbackBindings,
  LoopbackInterface,
  type LoopbackInterfaceOptions,
} from './bindings/loopback-interface.js';
import {
  TapBindings,
  TapInterface,
  type TapInterfaceOptions,
} from './bindings/tap-interface.js';
import {
  TcpBindings,
  type TcpConnectionOptions,
  type TcpListenerOptions,
} from './bindings/tcp.js';
import {
  TunBindings,
  TunInterface,
  type TunInterfaceOptions,
} from './bindings/tun-interface.js';
import { UdpBindings, type UdpSocketOptions } from './bindings/udp.js';
import { fetchFile } from './fetch-file.js';
import type { NetworkInterface, WasmInstance } from './types.js';

export async function createStack(options?: NetworkStackOptions) {
  const stack = new NetworkStack(options);
  await stack.ready;
  return stack;
}

export type NetworkStackOptions = {
  initializeLoopback?: boolean;
};

export class NetworkStack {
  #options: NetworkStackOptions;
  #loopIntervalId?: number;

  #loopbackBindings = new LoopbackBindings();
  #tunBindings = new TunBindings();
  #tapBindings = new TapBindings();
  #bridgeBindings = new BridgeBindings();
  #tcpBindings = new TcpBindings();
  #udpBindings = new UdpBindings();

  ready: Promise<void>;
  get interfaces() {
    return this.#listInterfaces();
  }

  constructor(options: NetworkStackOptions = {}) {
    this.#options = {
      ...options,
      initializeLoopback: options.initializeLoopback ?? true,
    };
    this.ready = this.#init();

    // Post-init setup
    this.ready.then(async () => {
      if (this.#options.initializeLoopback) {
        await this.createLoopbackInterface({
          ip: '127.0.0.1/8',
        });
      }
    });
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

    const source = fetchFile(
      new URL('../tcpip.wasm', import.meta.url),
      'application/wasm'
    );

    // Instantiate with both WASI and custom imports
    const { instance } = await WebAssembly.instantiateStreaming(source, {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: {
        ...this.#loopbackBindings.imports,
        ...this.#tunBindings.imports,
        ...this.#tapBindings.imports,
        ...this.#bridgeBindings.imports,
        ...this.#tcpBindings.imports,
        ...this.#udpBindings.imports,
      },
    });

    const wasmInstance = instance as WasmInstance;

    this.#loopbackBindings.register(wasmInstance.exports);
    this.#tunBindings.register(wasmInstance.exports);
    this.#tapBindings.register(wasmInstance.exports);
    this.#bridgeBindings.register(wasmInstance.exports);
    this.#tcpBindings.register(wasmInstance.exports);
    this.#udpBindings.register(wasmInstance.exports);

    const result = wasi.start(wasmInstance);

    if (result !== 0) {
      throw new Error(`wasi start failed with code ${result}`);
    }

    // Call lwIP's main loop regularly (required in NO_SYS mode)
    // Used to process queued packets (eg. loopback) and expired timeouts
    this.#loopIntervalId = Number(
      setInterval(() => {
        wasmInstance.exports.process_queued_packets();
        wasmInstance.exports.process_timeouts();
      }, 100)
    );
  }

  *#listInterfaces(): Iterable<NetworkInterface> {
    yield* this.#loopbackBindings.interfaces.values();
    yield* this.#tunBindings.interfaces.values();
    yield* this.#tapBindings.interfaces.values();
  }

  async createLoopbackInterface(
    options: LoopbackInterfaceOptions
  ): Promise<LoopbackInterface> {
    await this.ready;
    return this.#loopbackBindings.create(options);
  }

  async createTunInterface(
    options: TunInterfaceOptions
  ): Promise<TunInterface> {
    await this.ready;
    return this.#tunBindings.create(options);
  }

  async createTapInterface(
    options: TapInterfaceOptions = {}
  ): Promise<TapInterface> {
    await this.ready;
    return this.#tapBindings.create(options);
  }

  async createBridgeInterface(options: BridgeInterfaceOptions) {
    await this.ready;
    return this.#bridgeBindings.create(options);
  }

  async removeInterface(
    netInterface: LoopbackInterface | TunInterface | TapInterface
  ) {
    await this.ready;

    if (netInterface instanceof LoopbackInterface) {
      return this.#loopbackBindings.remove(netInterface);
    }

    if (netInterface instanceof TunInterface) {
      return this.#tunBindings.remove(netInterface);
    }

    if (netInterface instanceof TapInterface) {
      return this.#tapBindings.remove(netInterface);
    }

    throw new Error('unknown interface type');
  }

  /**
   * Listens for incoming TCP connections on the specified host/port.
   */
  async listenTcp(options: TcpListenerOptions) {
    await this.ready;
    return this.#tcpBindings.listen(options);
  }

  /**
   * Establishes an outbound TCP connection to a remote host/port.
   */
  async connectTcp(options: TcpConnectionOptions) {
    await this.ready;
    return this.#tcpBindings.connect(options);
  }

  /**
   * Opens a UDP socket for sending and receiving datagrams.
   *
   * If no local host is provided, the socket will bind to all available interfaces.
   * If no local port is provided, the socket will bind to a random port.
   */
  async openUdp(options: UdpSocketOptions = {}) {
    await this.ready;
    return this.#udpBindings.open(options);
  }
}
