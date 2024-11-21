import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
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
import { fetchFile } from './fetch-file.js';
import type { WasmInstance } from './types.js';

export async function createStack() {
  const stack = new NetworkStack();
  await stack.ready;
  return stack;
}

export class NetworkStack {
  #loopIntervalId?: number;
  #loopbackBindings = new LoopbackBindings();
  #tunBindings = new TunBindings();
  #tapBindings = new TapBindings();
  #tcpBindings = new TcpBindings();

  ready: Promise<void>;

  constructor() {
    this.ready = this.#init();
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
        ...this.#tcpBindings.imports,
      },
    });

    const wasmInstance = instance as WasmInstance;

    this.#loopbackBindings.register(wasmInstance.exports);
    this.#tunBindings.register(wasmInstance.exports);
    this.#tapBindings.register(wasmInstance.exports);
    this.#tcpBindings.register(wasmInstance.exports);

    wasi.start(wasmInstance);

    // Call lwIP's main loop regularly (required in NO_SYS mode)
    // Used to process queued packets (eg. loopback) and expired timeouts
    this.#loopIntervalId = Number(
      setInterval(() => {
        wasmInstance.exports.process_queued_packets();
        wasmInstance.exports.process_timeouts();
      }, 100)
    );
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
    options: TapInterfaceOptions
  ): Promise<TapInterface> {
    await this.ready;
    return this.#tapBindings.create(options);
  }

  async listenTcp(options: TcpListenerOptions) {
    await this.ready;
    return this.#tcpBindings.listen(options);
  }

  async connectTcp(options: TcpConnectionOptions) {
    await this.ready;
    return this.#tcpBindings.connect(options);
  }
}
