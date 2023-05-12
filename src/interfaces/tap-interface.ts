import EventEmitter from 'eventemitter3';
import TcpipStack from '../tcpip-stack';

interface EventTypes {
  frame: (frame: Uint8Array) => void;
}

interface TapInterfaceOptions {
  stack: TcpipStack;
  ipNetwork: string;
}

// Methods implemented in WASM
interface TapInterface {
  _init(options: TapInterfaceOptions): void;
  injectFrame(frame: Uint8Array): void;
}

class TapInterface extends EventEmitter<EventTypes> {
  constructor(public options: TapInterfaceOptions) {
    super();
    this._init(options);
  }
}

export default TapInterface;
