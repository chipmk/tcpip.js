import type { TapInterface } from 'tcpip';

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
 * Network adapter that connects tcpip.js with v86.
 *
 * Injects outgoing ethernet frames from v86 into a
 * tcpip.js stack and vice versa via a `TapInterface`.
 */
export class NetworkAdapter {
  constructor(public tapInterface: TapInterface, public bus: BusConnector) {
    bus.register(
      'net0-send',
      (frame: Uint8Array) => {
        tapInterface.injectFrame(frame);
      },
      this
    );
    tapInterface.on('frame', (frame) => {
      bus.send('net0-receive', frame);
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
 * Creates a `NetworkAdapter` that connects tcpip.js with v86.
 *
 * Injects outgoing ethernet frames from v86 into a
 * tcpip.js stack and vice versa via a `TapInterface`.
 *
 * Pass the result of this function to v86's `network_adapter` option.
 *
 * @example
 * {
 *   network_adapter: createNetworkAdapter(tapInterface),
 * }
 */
export function createNetworkAdapter(tapInterface: TapInterface) {
  return (bus: BusConnector) => new NetworkAdapter(tapInterface, bus);
}
