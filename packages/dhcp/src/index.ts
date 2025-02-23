import type { NetworkStack } from 'tcpip';
import { DhcpServer, type DhcpServerOptions } from './dhcp-server.js';

export * from './dhcp-server.js';
export type { DhcpLease } from './types.js';

/**
 * Creates a DHCP server function on top of a `tcpip` network stack.
 *
 * @example
 * const stack = await createStack();
 * const { serve } = createDhcp(stack);
 * const dhcpServer = await serve({ ... });
 */
export function createDhcp(stack: NetworkStack) {
  return {
    serve: async (options: DhcpServerOptions) => {
      const server = new DhcpServer(stack, options);
      await server.listen();
      return server;
    },
  };
}
