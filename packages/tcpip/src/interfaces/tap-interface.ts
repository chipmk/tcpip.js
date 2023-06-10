import { EventEmitter } from 'eventemitter3';
import Stack from '../stack.js';
import { BaseInterfaceOptions } from './base-interface.js';

export interface TapInterfaceEventTypes {
  frame: (frame: Uint8Array) => void;
}

export interface TapInterfaceOptions extends BaseInterfaceOptions {
  macAddress: string;
}

// Methods implemented in WASM
interface TapInterface {
  injectFrame(frame: Uint8Array): void;
}

class TapInterface extends EventEmitter<TapInterfaceEventTypes> {
  private _init: (options: TapInterfaceOptions) => void;

  constructor(public stack: Stack, public options: TapInterfaceOptions) {
    super();
    this._init(options);
  }
}

export default TapInterface;
