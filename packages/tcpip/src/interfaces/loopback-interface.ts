import Stack from '../stack.js';
import { BaseInterfaceOptions } from './base-interface.js';

export interface LoopbackInterfaceOptions extends BaseInterfaceOptions {}

// Methods implemented in WASM
interface LoopbackInterface {}

class LoopbackInterface {
  private _init: (options: LoopbackInterfaceOptions) => void;

  constructor(public stack: Stack, public options: LoopbackInterfaceOptions) {
    this._init(options);
  }
}

export default LoopbackInterface;
