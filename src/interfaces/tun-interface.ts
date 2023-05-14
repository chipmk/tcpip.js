import EventEmitter from 'eventemitter3';
import TcpipStack from '../tcpip-stack';

interface EventTypes {
  packet: (packet: Uint8Array) => void;
}

interface TunInterfaceOptions {
  stack: TcpipStack;
  ipNetwork: string;
}

// Methods implemented in WASM
interface TunInterface {
  _init(options: TunInterfaceOptions): void;
  injectPacket(packet: Uint8Array): void;
}

class TunInterface extends EventEmitter<EventTypes> {
  constructor(public options: TunInterfaceOptions) {
    super();
    this._init(options);
  }
}

export default TunInterface;
