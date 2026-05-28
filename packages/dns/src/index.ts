import type { DatagramTransport } from '@tcpip/transport';
import { DnsClient, type DnsClientOptions } from './dns-client.js';
import { DnsServer, type DnsServerOptions } from './dns-server.js';

export * from './dns-client.js';
export * from './dns-server.js';

export type { DnsResponse, DnsType, NameServer } from './types.js';
export { ipToPtrName, ptrNameToIP } from './util.js';

export type CreateDnsOptions = {
  /**
   * DNS client options.
   */
  client?: DnsClientOptions;
};

/**
 * Creates DNS server and client functions on top of a datagram transport.
 *
 * @example
 * const stack = await createStack();
 * const { serve, lookup } = await createDns(stack.udp);
 * const server = await serve({ ... });
 * const ip = await lookup('example.com');
 */
export async function createDns(
  transport: DatagramTransport,
  options: CreateDnsOptions = {}
) {
  const client = new DnsClient(transport, options.client);

  return {
    serve: async (options: DnsServerOptions) => {
      const server = new DnsServer(transport, options);
      await server.listen();
      return server;
    },
    lookup: async (name: string) => client.lookup(name),
    reverse: async (ip: string) => client.reverse(ip),
  };
}
