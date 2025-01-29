import { PreopenDirectory, File, WASI, Fd } from '@bjorn3/browser_wasi_shim';
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
  entrypoint?: string;
  command?: string[];
  env?: Record<string, string>;
  debug?: boolean;
};

export class VM {
  #options: VMOptions;

  #stdinRing: RingBuffer;
  #stdoutRing: RingBuffer;
  #stderrRing: RingBuffer;

  #receiveRing: RingBuffer;
  #sendRing: RingBuffer;

  #debug: (...data: unknown[]) => void = () => {};

  constructor(options: VMOptions, log?: (...data: unknown[]) => void) {
    if (options.debug && log) {
      this.#debug = (...data: unknown[]) => log('VM:', ...data);
    }

    this.#options = options;

    this.#stdinRing = new RingBuffer(
      options.stdio.stdinBuffer,
      (data) => this.#debug('Stdin:', data),
      options.debug
    );
    this.#stdoutRing = new RingBuffer(
      options.stdio.stdoutBuffer,
      (data) => this.#debug('Stdout:', data),
      options.debug
    );
    this.#stderrRing = new RingBuffer(
      options.stdio.stderrBuffer,
      (data) => this.#debug('Stderr:', data),
      options.debug
    );

    this.#receiveRing = new RingBuffer(
      options.net.receiveBuffer,
      (...data: unknown[]) => this.#debug('Receive:', ...data),
      options.debug
    );
    this.#sendRing = new RingBuffer(
      options.net.sendBuffer,
      (...data: unknown[]) => this.#debug('Send:', ...data),
      options.debug
    );
  }

  async run() {
    const env = Object.entries(this.#options.env ?? {}).map(
      ([key, value]) => `${key}=${value}`
    );

    const args = ['arg0'];

    args.push('--net', 'socket');

    args.push('--mac', this.#options.net.macAddress);

    if (this.#options.entrypoint) {
      args.push('--entrypoint', this.#options.entrypoint);
    }

    if (this.#options.command) {
      args.push('--', ...this.#options.command);
    }

    const wasi = new WASI(args, env, []);

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
        write: (data) => {
          this.#stdoutRing.write(data);
        },
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

    const wasmResponse = await fetchFile(
      this.#options.wasmUrl,
      'application/wasm'
    );
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
