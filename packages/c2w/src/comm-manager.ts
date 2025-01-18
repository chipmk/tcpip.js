import { RingBuffer } from './ring-buffer.js';

export class CommManager {
  #recvRing: RingBuffer;
  #sendRing: RingBuffer;
  log: (...data: unknown[]) => void;

  constructor(
    recvBuffer: SharedArrayBuffer,
    sendBuffer: SharedArrayBuffer,
    log: (...data: unknown[]) => void
  ) {
    this.#recvRing = new RingBuffer(recvBuffer);
    this.#sendRing = new RingBuffer(sendBuffer);
    this.log = (...data) => log('CommManager:', ...data);
  }

  write(data: Uint8Array) {
    this.log('Writing...');
    this.#sendRing.write(data);
  }

  read() {
    this.log('Reading...');
    return this.#recvRing.read();
  }
}

// const CONTROL_SIGNAL_INDEX = 0;
// const DATA_LENGTH_INDEX = 1;
// const DATA_INDEX = 2;

// /**
//  * Manages communication between two workers using shared memory and atomics.
//  *
//  * Allows for synchronous byte-level communication between two workers.
//  */
// export class CommManager {
//   #readControl: Int32Array;
//   #writeControl: Int32Array;
//   #readData: Uint8Array;
//   #writeData: Uint8Array;
//   log: (...data: unknown[]) => void;

//   constructor(
//     readBuffer: SharedArrayBuffer,
//     writeBuffer: SharedArrayBuffer,
//     log: (...data: unknown[]) => void
//   ) {
//     // Control views need to be Int32Array due to Atomics.wait/notify
//     this.#readControl = new Int32Array(readBuffer);
//     this.#writeControl = new Int32Array(writeBuffer);

//     // Data views can be Uint8Array for byte-level access
//     this.#readData = new Uint8Array(
//       readBuffer,
//       DATA_INDEX * Int32Array.BYTES_PER_ELEMENT
//     );
//     this.#writeData = new Uint8Array(
//       writeBuffer,
//       DATA_INDEX * Int32Array.BYTES_PER_ELEMENT
//     );
//     this.log = (...data: unknown[]) => log('CommManager:', ...data);
//     this.log('created');
//   }

//   read() {
//     this.log('Reading...');
//     // Wait for the control signal to be set
//     const waitResult = Atomics.wait(this.#readControl, CONTROL_SIGNAL_INDEX, 0);
//     this.log('waitResult', waitResult);
//     if (waitResult === 'ok') {
//       const length = this.#readControl[DATA_LENGTH_INDEX]!;
//       return this.#readData.slice(0, length);
//     }
//   }

//   write(data: Uint8Array) {
//     this.log('Writing...');
//     this.#writeControl[DATA_LENGTH_INDEX] = data.length;
//     this.#writeData.set(data);

//     // Notify the other side
//     Atomics.notify(this.#writeControl, CONTROL_SIGNAL_INDEX, 1);
//     this.log('Notified');
//   }
// }
