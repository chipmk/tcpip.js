import Stack from '../stack.js';

export interface LoopbackInterfaceOptions {
  ipAddress: string;
}

// Methods implemented in WASM
interface LoopbackInterface {}

class LoopbackInterface {
  private _init: (options: LoopbackInterfaceOptions) => void;

  constructor(public stack: Stack, public options: LoopbackInterfaceOptions) {
    this._init(options);
  }
}

export default LoopbackInterface;
