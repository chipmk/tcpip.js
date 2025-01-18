import { expose } from 'comlink';
import { CommManager } from '../comm-manager.js';
// import { startContainer } from '../wasi-util.js';

export type VMOptions = {
  log(message?: string): void;
};

export class VM {
  #commManager: CommManager;
  log: (...data: unknown[]) => void;

  constructor(
    readBuffer: SharedArrayBuffer,
    writeBuffer: SharedArrayBuffer,
    log: (...data: unknown[]) => void
  ) {
    this.log = (...data: unknown[]) => log('VM:', ...data);
    this.#commManager = new CommManager(readBuffer, writeBuffer, this.log);
    this.log('created');
  }

  async run() {
    this.log('Running...');
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    // while (true) {
    this.log('Waiting for message...');
    const data = this.#commManager.read();

    if (!data) {
      this.log('No data...');
      // continue;
      return;
    }

    const message = textDecoder.decode(data);
    this.log('got message', message);

    const reply = textEncoder.encode(`Hello, ${message}!`);
    this.#commManager.write(reply);
    this.#commManager.write(textEncoder.encode(`Hello, ${message}!!!!`));
    // }
  }
}

expose(VM);
