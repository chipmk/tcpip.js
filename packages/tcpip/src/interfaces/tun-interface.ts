import { EventEmitter } from 'eventemitter3';
import Stack from '../stack.js';

export interface TunInterfaceEventTypes {
  packet: (packet: Uint8Array) => void;
}

export interface TunInterfaceOptions {
  ipAddress: string;
}

// Methods implemented in WASM
interface TunInterface {
  injectPacket(packet: Uint8Array): void;
}

class TunInterface extends EventEmitter<TunInterfaceEventTypes> {
  private _init: (options: TunInterfaceOptions) => void;

  constructor(public stack: Stack, public options: TunInterfaceOptions) {
    super();
    this._init(options);
  }
}

export default TunInterface;
