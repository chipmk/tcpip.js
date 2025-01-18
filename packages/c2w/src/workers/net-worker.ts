import { expose } from 'comlink';
import { CommManager } from '../comm-manager.js';

export class Net {
  #commManager: CommManager;
  log: (...data: unknown[]) => void;

  constructor(
    readBuffer: SharedArrayBuffer,
    writeBuffer: SharedArrayBuffer,
    log: (...data: unknown[]) => void
  ) {
    this.log = (...data: unknown[]) => log('Net:', ...data);
    this.#commManager = new CommManager(readBuffer, writeBuffer, this.log);
    this.log('created');
  }

  async send(message: string) {
    this.log('Sending message:', message);
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    const messageBytes = textEncoder.encode(message);
    this.#commManager.write(messageBytes);

    const data = this.#commManager.read();
    const reply = textDecoder.decode(data);

    return reply;
  }
}

expose(Net);
