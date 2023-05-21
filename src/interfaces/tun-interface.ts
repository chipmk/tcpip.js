import EventEmitter from 'eventemitter3';
import Stack from '../stack';

export interface TunInterfaceEventTypes {
  packet: (packet: Uint8Array) => void;
}

export interface TunInterfaceOptions {
  ipNetwork: string;
}

// Methods implemented in WASM
interface TunInterface {
  _init(options: TunInterfaceOptions): void;
  injectPacket(packet: Uint8Array): void;
}

class TunInterface extends EventEmitter<TunInterfaceEventTypes> {
  constructor(public stack: Stack, public options: TunInterfaceOptions) {
    super();
    this._init(options);
  }
}

export default TunInterface;
