import type { NetworkStack, UdpDatagram, UdpSocket } from 'tcpip';
import type { DnsMessage, DnsRecord, DnsResponse, DnsType } from './types.js';
import { parseDnsMessage, serializeDnsMessage } from './wire.js';

export type RequestFn = (query: {
  name: string;
  type: DnsType;
}) => Promise<DnsResponse | DnsResponse[] | void>;

export type DnsServerOptions = {
  /**
   * Port to listen on.
   *
   * @default 53
   */
  port?: number;

  /**
   * Callback function to handle DNS queries.
   */
  request: RequestFn;
};

export class DnsServer {
  #stack: NetworkStack;
  #options: DnsServerOptions;

  constructor(stack: NetworkStack, options: DnsServerOptions) {
    this.#stack = stack;
    this.#options = options;
  }

  async listen() {
    const socket = await this.#stack.openUdp({
      port: this.#options.port ?? 53,
    });
    this.#processDnsMessages(socket);
  }

  async #processDnsMessages(socket: UdpSocket) {
    const writer = socket.writable.getWriter();

    for await (const datagram of socket) {
      // Process each message without blocking
      this.#processDnsMessage(datagram, writer);
    }
  }

  async #processDnsMessage(
    datagram: UdpDatagram,
    writer: WritableStreamDefaultWriter<UdpDatagram>
  ) {
    try {
      const { host, port } = datagram;
      const requestMessage = parseDnsMessage(datagram.data);
      const responseMessage = await handleRequestMessage(
        requestMessage,
        this.#options.request
      );
      const data = serializeDnsMessage(responseMessage);
      await writer.write({ host, port, data });
    } catch (err) {
      console.error('error handling dns query:', err);
    }
  }
}

async function handleRequestMessage(
  requestMessage: DnsMessage,
  request: RequestFn
) {
  if (requestMessage.questions.length > 1) {
    throw new Error('only one dns question is supported');
  }

  const [question] = requestMessage.questions;

  if (!question) {
    throw new Error('no question found in dns message');
  }

  if (question.class !== 'IN') {
    throw new Error('only IN class is supported');
  }

  // Get response from user's handler
  const response = await request({
    name: question.name,
    type: question.type,
  });

  // Convert back to DNS message format
  return createResponseMessage(requestMessage, response);
}

/**
 * Convert a response from the user's handler to a DNS message.
 */
function createResponseMessage(
  query: DnsMessage,
  response: DnsResponse | DnsResponse[] | void
): DnsMessage {
  // Handle undefined response (NXDOMAIN)
  if (!response) {
    return {
      header: {
        ...query.header,
        isResponse: true,
        isRecursionAvailable: false,
        rcode: 'NXDOMAIN',
      },
      questions: query.questions,
      answers: [],
      authorities: [],
      additionals: [],
    };
  }

  const question = query.questions[0];

  if (!question) {
    throw new Error('no question found in dns message');
  }

  if (question.class !== 'IN') {
    throw new Error('only IN class is supported');
  }

  const responses = Array.isArray(response) ? response : [response];

  const answers = responses.map<DnsRecord>((response) => ({
    name: question.name,
    class: 'IN',
    ...response,
  }));

  return {
    header: {
      ...query.header,
      isResponse: true,
      isRecursionAvailable: false,
      rcode: 'NOERROR',
    },
    questions: query.questions,
    answers,
    authorities: [],
    additionals: [],
  };
}
