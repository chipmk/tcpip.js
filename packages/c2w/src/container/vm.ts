import { WASI } from '@bjorn3/browser_wasi_shim';
import { fetchFile } from '../fetch-file.js';
import { RingBuffer } from '../ring-buffer/ring-buffer.js';
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

export type VMStdioOptions = {
  stdinBuffer: SharedArrayBuffer;
  stdoutBuffer: SharedArrayBuffer;
  stderrBuffer: SharedArrayBuffer;
};

export type VMOptions = {
  wasmUrl: string | URL;
  stdio: VMStdioOptions;
  net: VMNetOptions;
};

export class VM {
  #wasmUrl: string | URL;

  #stdinRing: RingBuffer;
  #stdoutRing: RingBuffer;
  #stderrRing: RingBuffer;

  #receiveRing: RingBuffer;
  #sendRing: RingBuffer;
  #macAddress: string;

  constructor(options: VMOptions, log?: (...data: unknown[]) => void) {
    if (log) {
      console.log = (...data: unknown[]) => log('VM:', ...data);
    }

    this.#wasmUrl = options.wasmUrl;

    this.#stdinRing = new RingBuffer(options.stdio.stdinBuffer, (data) =>
      console.log('Stdin:', data)
    );
    this.#stdoutRing = new RingBuffer(options.stdio.stdoutBuffer, (data) =>
      console.log('Stdout:', data)
    );
    this.#stderrRing = new RingBuffer(options.stdio.stderrBuffer, (data) =>
      console.log('Stderr:', data)
    );

    this.#receiveRing = new RingBuffer(
      options.net.receiveBuffer,
      (...data: unknown[]) => console.log('Receive:', ...data)
    );
    this.#sendRing = new RingBuffer(
      options.net.sendBuffer,
      (...data: unknown[]) => console.log('Send:', ...data)
    );
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
      stdin: {
        read: (len) => this.#stdinRing.read(len),
        hasData: () => this.#stdinRing.hasData,
        waitForData: (timeout) => this.#stdinRing.waitForData(timeout),
      },
      stdout: {
        write: (data) => this.#stdoutRing.write(data),
      },
      stderr: {
        write: (data) => this.#stderrRing.write(data),
      },
      net: {
        accept: () => true,
        send: (data) => this.#sendRing.write(data),
        receive: (len) => this.#receiveRing.read(len),
        hasData: () => this.#receiveRing.hasData,
        waitForData: (timeout) => this.#receiveRing.waitForData(timeout),
      },
    });

    const wasmResponse = await fetchFile(this.#wasmUrl, 'application/wasm');
    const { instance } = await WebAssembly.instantiateStreaming(wasmResponse, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    const wasiInstance = instance as WasiInstance;
    return wasi.start(wasiInstance);
  }

  close() {
    self.close();
  }
}
