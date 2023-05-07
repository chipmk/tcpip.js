import EventEmitter from 'eventemitter3';

export function unwrap<T, Args extends any[]>(
  fn: (...args: Args) => [T, Error]
) {
  return function (...args: Args): T {
    const [value, error] = fn.apply(this, args);
    if (error) {
      throw error;
    }
    return value;
  };
}

export type TcpipStackOptions = {
  ipNetwork: string;
};

interface EventTypes {
  'outbound-ethernet-frame': (frame: Uint8Array) => void;
}

interface TcpipStack {
  _init(options: TcpipStackOptions): void;
}

interface TcpipStack {
  injectEthernetFrame(frame: Uint8Array): void;
}

class TcpipStack extends EventEmitter<EventTypes> {
  constructor(public options: TcpipStackOptions) {
    super();
    this._init(options);
  }
}

export default TcpipStack;
