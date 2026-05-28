import type { DatagramTransport } from '@tcpip/transport';
import { DhcpServer, type DhcpServerOptions } from './dhcp-server.js';

export * from './dhcp-server.js';
export type { DhcpLease } from './types.js';

/**
 * Creates a DHCP server function on top of a datagram transport.
 *
 * @example
 * const stack = await createStack();
 * const { serve } = await createDhcp(stack.udp);
 * const dhcpServer = await serve({ ... });
 */
export async function createDhcp(transport: DatagramTransport) {
  return {
    serve: async (options: DhcpServerOptions) => {
      const server = new DhcpServer(transport, options);
      await server.listen();
      return server;
    },
  };
}
