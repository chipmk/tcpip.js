import type { NetworkStack } from 'tcpip';
import type { DnsMessage, DnsQuery, DnsRecord, NameServer } from './types.js';
import { ipToPtrName } from './util.js';
import { parseDnsMessage, serializeDnsMessage } from './wire.js';

export type DnsClientOptions = {
  /**
   * Name server address to query.
   * @default { ip: '127.0.0.1', port: 53 }
   */
  nameServer?: NameServer;
};

export class DnsClient {
  #stack: NetworkStack;
  #nameServer: NameServer;
  #messageId = 0;

  constructor(stack: NetworkStack, options: DnsClientOptions = {}) {
    this.#stack = stack;
    this.#nameServer = options.nameServer ?? { ip: '127.0.0.1', port: 53 };
  }

  /**
   * Send a DNS query and wait for the response.
   */
  async #query(query: DnsQuery): Promise<DnsRecord> {
    // Create DNS message for query
    const message: DnsMessage = {
      header: {
        id: this.#getNextMessageId(),
        isResponse: false,
        opcode: 'QUERY',
        isAuthoritativeAnswer: false,
        isTruncated: false,
        isRecursionDesired: true,
        isRecursionAvailable: false,
        rcode: 'NOERROR',
        questionCount: 0,
        answerCount: 0,
        authorityCount: 0,
        additionalCount: 0,
      },
      questions: [
        {
          name: query.name,
          type: query.type,
          class: 'IN',
        },
      ],
    };

    const socket = await this.#stack.openUdp();

    // Serialize and send the message
    const data = serializeDnsMessage(message);
    const writer = socket.writable.getWriter();

    await writer.write({
      host: this.#nameServer.ip,
      port: this.#nameServer.port,
      data,
    });

    // Wait for and parse the response
    for await (const datagram of socket) {
      const response = parseDnsMessage(datagram.data);

      // Verify this is the response to our query
      if (response.header.id !== message.header.id) {
        continue;
      }

      // Check for errors
      if (response.header.rcode !== 'NOERROR') {
        throw new Error(
          `dns query failed with rcode: ${response.header.rcode}`
        );
      }

      if (response.header.answerCount > 1) {
        throw new Error('expected exactly one dns answer');
      }

      const [answer] = response.answers ?? [];

      if (!answer) {
        throw new Error('no dns answer found');
      }

      return answer;
    }

    throw new Error('udp socket closed before receiving response');
  }

  /**
   * Performs an A record lookup to get the IP address for a hostname.
   */
  async lookup(name: string): Promise<string> {
    const response = await this.#query({ name, type: 'A' });

    if (!response || response.type !== 'A') {
      throw new Error(`no A record found for ${name}`);
    }

    return response.ip;
  }

  /**
   * Performs a reverse DNS (PTR) lookup to get the hostname for an IP address.
   */
  async reverse(ip: string): Promise<string> {
    const ptrName = ipToPtrName(ip);
    const response = await this.#query({ name: ptrName, type: 'PTR' });

    if (!response || response.type !== 'PTR') {
      throw new Error(`No PTR record found for ${ip}`);
    }

    return response.ptr;
  }

  /**
   * Get the next message ID, cycling from 0-65535.
   */
  #getNextMessageId(): number {
    this.#messageId = (this.#messageId + 1) % 65536;
    return this.#messageId;
  }
}
