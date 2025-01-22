import { WASI } from '@bjorn3/browser_wasi_shim';
import { createRingBuffer, type RingBuffer } from '../ring-buffer/index.js';
import { generateMacAddress, parseMacAddress } from '../util.js';
import { handleWasiSocket } from '../wasi/socket-extension.js';

type WasiInstance = WebAssembly.Instance & {
  exports: {
    memory: WebAssembly.Memory;
    _start: () => unknown;
  };
};

export type VMNetOptions = {
  receiveBuffer: SharedArrayBuffer;
  sendBuffer: SharedArrayBuffer;
  macAddress: string;
};

export type VMOptions = {
  wasmUrl: string | URL;
  net: VMNetOptions;
};

export class VM {
  #wasmUrl: string | URL;
  #receiveRing: RingBuffer;
  #sendRing: RingBuffer;
  #macAddress: string;

  constructor(options: VMOptions, log?: (...data: unknown[]) => void) {
    if (log) {
      console.log = (...data: unknown[]) => log('VM:', ...data);
    }

    this.#wasmUrl = options.wasmUrl;
    this.#receiveRing = createRingBuffer(options.net.receiveBuffer);
    this.#sendRing = createRingBuffer(options.net.sendBuffer);
    this.#macAddress = options.net.macAddress;
  }

  async run() {
    const wasi = new WASI(
      ['arg0', '--net=socket', '--mac', this.#macAddress],
      [],
      []
    );

    const listenFd = 3;
    const connectionFd = 4;

    handleWasiSocket(wasi, {
      listenFd,
      connectionFd,
      accept: () => true,
      send: (data) => this.#sendRing.write(data),
      receive: (len) => this.#receiveRing.read(len),
      hasData: () => this.#receiveRing.hasData,
      waitForData: (timeout) => this.#receiveRing.waitForData(timeout),
    });

    const wasmResponse = await fetch(this.#wasmUrl);
    const { instance } = await WebAssembly.instantiateStreaming(wasmResponse, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    const wasiInstance = instance as WasiInstance;
    wasi.start(wasiInstance);
  }
}
