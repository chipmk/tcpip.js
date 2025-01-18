export interface V86Emulator {
  bus: BusConnector;
  add_listener(event: string, listener: (data: Uint8Array) => void): void;
}

export interface BusConnector {
  pair: BusConnector;

  register(
    name: string,
    fn: (frame: Uint8Array) => void,
    this_value: any
  ): void;
  unregister(name: string, fn: (frame: Uint8Array) => void): void;
  send(name: string, value: any): void;
  send_async(name: string, value: any): void;
}

/**
 * Network adapter for v86 that exposes the VM's NIC as a duplex stream.
 *
 * Intended to be piped to/from a tcpip.js `TapInterface`.
 */
export class V86NetworkStream {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  constructor(emulator: V86Emulator) {
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        emulator.add_listener('net0-send', (frame: Uint8Array) => {
          controller.enqueue(frame);
        });
      },
    });

    this.writable = new WritableStream<Uint8Array>({
      write: (frame) => {
        emulator.bus.send('net0-receive', frame);
      },
    });
  }

  /**
   * Called by v86 when it is destroyed.
   *
   * Currently a no-op.
   */
  destroy() {}
}

/**
 * Network adapter for v86 that exposes the VM's NIC as a duplex stream.
 *
 * Intended to be piped to/from a tcpip.js `TapInterface`.
 *
 * @example
 * const stack = await createStack();
 *
 * const tapInterface = await stack.createTapInterface({
 *   mac: '01:23:45:67:89:ab',
 *   ip: '192.168.1.1/24',
 * });
 *
 * const emulator = new V86();
 * const vmNic = createV86NetworkStream(emulator);
 *
 * // Forward frames between the tap interface and the VM's NIC
 * tapInterface.readable.pipeTo(vmNic.writable);
 * vmNic.readable.pipeTo(tapInterface.writable);
 */
export function createV86NetworkStream(emulator: V86Emulator) {
  return new V86NetworkStream(emulator);
}
