import Stack from '../stack';

export interface LoopbackInterfaceOptions {
  ipNetwork: string;
}

// Methods implemented in WASM
interface LoopbackInterface {
  _init(options: LoopbackInterfaceOptions): void;
}

class LoopbackInterface {
  constructor(public stack: Stack, public options: LoopbackInterfaceOptions) {
    this._init(options);
  }
}

export default LoopbackInterface;
