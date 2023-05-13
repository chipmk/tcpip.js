import TcpipStack from '../tcpip-stack';

interface LoopbackInterfaceOptions {
  stack: TcpipStack;
  ipNetwork: string;
}

// Methods implemented in WASM
interface LoopbackInterface {
  _init(options: LoopbackInterfaceOptions): void;
}

class LoopbackInterface {
  constructor(public options: LoopbackInterfaceOptions) {
    this._init(options);
  }
}

export default LoopbackInterface;
