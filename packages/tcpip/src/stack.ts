import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import { DnsClient, type NameServer } from '@tcpip/dns';
import { BridgeBindings } from './bindings/bridge-interface.js';
import { IcmpBindings } from './bindings/icmp.js';
import { LoopbackBindings } from './bindings/loopback-interface.js';
import { TapBindings } from './bindings/tap-interface.js';
import { TcpBindings } from './bindings/tcp.js';
import { TunBindings } from './bindings/tun-interface.js';
import type { WasmInstance } from './bindings/types.js';
import { UdpBindings } from './bindings/udp.js';
import { fetchFile } from './fetch-file.js';
import type {
  NetworkInterface,
  NetworkInterfaces,
  NetworkStack,
  PingApi,
  TcpTransport,
  UdpTransport,
} from './types.js';

export async function createStack(
  options?: NetworkStackOptions
): Promise<NetworkStack> {
  const stack = new VirtualNetworkStack(options);
  await stack.ready;
  return stack;
}

export type NetworkStackOptions = {
  /**
   * Whether to initialize a loopback interface on startup.
   *
   * @default true
   */
  initializeLoopback?: boolean;

  /**
   * Name server used for DNS resolution.
   *
   * @default { ip: '127.0.0.1', port: 53 }
   */
  nameServer?: NameServer;
};

export class VirtualNetworkStack implements NetworkStack {
  #options: NetworkStackOptions;
  #loopIntervalId?: number;
  #dnsClient: DnsClient;

  #loopbackBindings: LoopbackBindings;
  #tunBindings: TunBindings;
  #tapBindings: TapBindings;
  #bridgeBindings: BridgeBindings;
  #tcpBindings: TcpBindings;
  #udpBindings: UdpBindings;
  #icmpBindings: IcmpBindings;

  ready: Promise<void>;
  readonly tcp: TcpTransport;
  readonly udp: UdpTransport;
  readonly ping: PingApi;
  readonly interfaces: NetworkInterfaces;

  constructor(options: NetworkStackOptions = {}) {
    this.#options = {
      ...options,
      initializeLoopback: options.initializeLoopback ?? true,
    };

    // Initialize bindings
    this.#loopbackBindings = new LoopbackBindings();
    this.#tunBindings = new TunBindings();
    this.#tapBindings = new TapBindings();
    this.#bridgeBindings = new BridgeBindings();

    this.tcp = {
      connect: async (options) => {
        await this.ready;
        return this.#tcpBindings.connect(options);
      },
      listen: async (options) => {
        await this.ready;
        return this.#tcpBindings.listen(options);
      },
    };
    this.udp = {
      open: async (options = {}) => {
        await this.ready;
        return this.#udpBindings.open(options);
      },
    };
    this.ping = {
      createSession: async (options) => {
        await this.ready;
        return this.#icmpBindings.createPingSession(options);
      },
    };
    this.interfaces = {
      createLoopback: async (options) => {
        await this.ready;
        return this.#loopbackBindings.create(options);
      },
      createTun: async (options) => {
        await this.ready;
        return this.#tunBindings.create(options);
      },
      createTap: async (options = {}) => {
        await this.ready;
        return this.#tapBindings.create(options);
      },
      createBridge: async (options) => {
        await this.ready;
        return this.#bridgeBindings.create(options);
      },
      remove: async (netInterface) => {
        await this.ready;

        switch (netInterface.type) {
          case 'loopback':
            return this.#loopbackBindings.remove(netInterface);
          case 'tun':
            return this.#tunBindings.remove(netInterface);
          case 'tap':
            return this.#tapBindings.remove(netInterface);
          case 'bridge':
            return this.#bridgeBindings.remove(netInterface);
          default:
            throw new Error('unknown interface type');
        }
      },
      [Symbol.iterator]: () => this.#listInterfaces(),
    };
    this.#dnsClient = new DnsClient(this.udp, {
      nameServer: options.nameServer ?? { ip: '127.0.0.1', port: 53 },
    });
    this.#tcpBindings = new TcpBindings(this.#dnsClient);
    this.#udpBindings = new UdpBindings(this.#dnsClient);
    this.#icmpBindings = new IcmpBindings(this.#dnsClient);

    // Initialize the stack
    this.ready = this.#init();

    // Post-init setup
    this.ready.then(async () => {
      if (this.#options.initializeLoopback) {
        await this.interfaces.createLoopback({
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
        ...this.#icmpBindings.imports,
      },
    });

    const wasmInstance = instance as WasmInstance;

    this.#loopbackBindings.register(wasmInstance.exports);
    this.#tunBindings.register(wasmInstance.exports);
    this.#tapBindings.register(wasmInstance.exports);
    this.#bridgeBindings.register(wasmInstance.exports);
    this.#tcpBindings.register(wasmInstance.exports);
    this.#udpBindings.register(wasmInstance.exports);
    this.#icmpBindings.register(wasmInstance.exports);

    // Our WASM binary is a WASI reactor module (ie. a lib),
    // so we call `initialize()` instead of `start()`.
    wasi.initialize(wasmInstance);

    // Call lwIP's main loop regularly (required in NO_SYS mode)
    // Used to process queued packets (eg. loopback) and expired timeouts
    this.#loopIntervalId = Number(
      setInterval(() => {
        wasmInstance.exports.process_queued_packets();
        wasmInstance.exports.process_timeouts();
      }, 100)
    );
  }

  *#listInterfaces(): IterableIterator<NetworkInterface> {
    yield* this.#loopbackBindings.interfaces.values();
    yield* this.#tunBindings.interfaces.values();
    yield* this.#tapBindings.interfaces.values();
    yield* this.#bridgeBindings.interfaces.values();
  }

  /**
   * @deprecated Use `stack.interfaces.createLoopback()` instead.
   */
  createLoopbackInterface(
    ...args: Parameters<NetworkStack['createLoopbackInterface']>
  ): ReturnType<NetworkStack['createLoopbackInterface']> {
    return this.interfaces.createLoopback(...args);
  }

  /**
   * @deprecated Use `stack.interfaces.createTun()` instead.
   */
  createTunInterface(
    ...args: Parameters<NetworkStack['createTunInterface']>
  ): ReturnType<NetworkStack['createTunInterface']> {
    return this.interfaces.createTun(...args);
  }

  /**
   * @deprecated Use `stack.interfaces.createTap()` instead.
   */
  createTapInterface(
    ...args: Parameters<NetworkStack['createTapInterface']>
  ): ReturnType<NetworkStack['createTapInterface']> {
    return this.interfaces.createTap(...args);
  }

  /**
   * @deprecated Use `stack.interfaces.createBridge()` instead.
   */
  createBridgeInterface(
    ...args: Parameters<NetworkStack['createBridgeInterface']>
  ): ReturnType<NetworkStack['createBridgeInterface']> {
    return this.interfaces.createBridge(...args);
  }

  /**
   * @deprecated Use `stack.interfaces.remove()` instead.
   */
  removeInterface(
    ...args: Parameters<NetworkStack['removeInterface']>
  ): ReturnType<NetworkStack['removeInterface']> {
    return this.interfaces.remove(...args);
  }

  /**
   * @deprecated Use `stack.tcp.listen()` instead.
   */
  listenTcp(
    ...args: Parameters<NetworkStack['listenTcp']>
  ): ReturnType<NetworkStack['listenTcp']> {
    return this.tcp.listen(...args);
  }

  /**
   * @deprecated Use `stack.tcp.connect()` instead.
   */
  connectTcp(
    ...args: Parameters<NetworkStack['connectTcp']>
  ): ReturnType<NetworkStack['connectTcp']> {
    return this.tcp.connect(...args);
  }

  /**
   * @deprecated Use `stack.udp.open()` instead.
   */
  openUdp(
    ...args: Parameters<NetworkStack['openUdp']>
  ): ReturnType<NetworkStack['openUdp']> {
    return this.udp.open(...args);
  }

  /**
   * @deprecated Use `stack.ping.createSession()` instead.
   */
  createPingSession(
    ...args: Parameters<NetworkStack['createPingSession']>
  ): ReturnType<NetworkStack['createPingSession']> {
    return this.ping.createSession(...args);
  }
}
