import type { NetworkStack } from 'tcpip';
import { DhcpServer, type DhcpServerOptions } from './dhcp-server.js';

export * from './dhcp-server.js';
export type { DhcpLease } from './types.js';

export function createDhcp(stack: NetworkStack) {
  return {
    serve: async (options: DhcpServerOptions) => {
      const server = new DhcpServer(stack, options);
      await server.listen();
      return server;
    },
  };
}
