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
 * Pass this instance's `adapter` function to v86's `network_adapter` option.
 *
 * Intended to be piped to/from a tcpip.js `TapInterface`.
 */
export class V86NetworkStream {
  #bus?: BusConnector;
  #readableController?: ReadableStreamDefaultController<Uint8Array>;

  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  constructor() {
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#readableController = controller;
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: (frame) => {
        if (!this.#bus) {
          throw new Error(
            'writing frame to V86NetworkStream before VM is ready to receive'
          );
        }
        this.#bus.send('net0-send', frame);
      },
    });
  }

  /**
   * Creates a network adapter for v86 and forwards frames
   * to/from this instance's `readable` and `writable` streams.
   *
   * Pass this function to v86's `network_adapter` option.
   */
  get adapter() {
    return (bus: BusConnector) => {
      if (this.#bus) {
        throw new Error('V86NetworkStream adapter already initialized');
      }

      this.#bus = bus;
      this.#bus.register(
        'net0-receive',
        (frame: Uint8Array) => {
          if (!this.#readableController) {
            throw new Error(
              'received frame from VM before V86NetworkStream is ready to receive'
            );
          }
          this.#readableController.enqueue(frame);
        },
        this
      );
    };
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
 * Pass this instance's `adapter` function to v86's `network_adapter` option.
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
 * const vmNic = createV86NetworkStream();
 *
 * const v86 = new V86Starter({
 *   network_adapter: vmNic.adapter,
 * });
 *
 * // Forward frames between the tap interface and the VM's NIC
 * tapInterface.readable.pipeTo(vmNic.writable);
 * vmNic.readable.pipeTo(tapInterface.writable);
 */
export function createV86NetworkStream() {
  return new V86NetworkStream();
}
