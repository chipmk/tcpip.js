import type { NetworkStack, UdpDatagram, UdpSocket } from 'tcpip/types';
import { describe, expect, it } from 'vitest';
import {
  DHCP_SERVER_PORT,
  DhcpMessageTypes,
  DhcpOptions,
} from './constants.js';
import { DhcpServer, type DhcpServerOptions } from './dhcp-server.js';
import { parseDhcpMessage } from './wire.js';

const defaultOptions: DhcpServerOptions = {
  leaseRange: { start: '192.168.1.100', end: '192.168.1.102' },
  leaseDuration: 3600,
  serverIdentifier: '192.168.1.1',
  netmask: '255.255.255.0',
  router: '192.168.1.1',
};

class AsyncQueue<T> implements AsyncIterable<T> {
  #values: T[] = [];
  #waiters: Array<(value: IteratorResult<T>) => void> = [];
  #closed = false;

  push(value: T) {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.#values.push(value);
  }

  close() {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    const value = this.#values.shift();
    if (value) {
      return { value, done: false };
    }
    if (this.#closed) {
      return { value: undefined, done: true };
    }
    return await new Promise((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

class TestUdpSocket implements UdpSocket, AsyncIterable<UdpDatagram> {
  #incoming = new AsyncQueue<UdpDatagram>();
  #outgoing = new AsyncQueue<UdpDatagram>();

  readable = new ReadableStream<UdpDatagram>();
  writable = new WritableStream<UdpDatagram>({
    write: async (datagram) => {
      this.#outgoing.push(datagram);
    },
  });

  receive(data: Uint8Array) {
    this.#incoming.push({
      host: '0.0.0.0',
      port: 68,
      data,
    });
  }

  async nextReply() {
    const result = await this.#outgoing.next();
    if (result.done) {
      throw new Error('expected udp reply');
    }
    return result.value;
  }

  async nextReplyMessage() {
    return parseDhcpMessage((await this.nextReply()).data);
  }

  async maybeNextReply(timeoutMs = 50) {
    return await Promise.race([
      this.nextReply(),
      new Promise<undefined>((resolve) => {
        setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  }

  async close() {
    this.#incoming.close();
    this.#outgoing.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<UdpDatagram> {
    return this.#incoming[Symbol.asyncIterator]();
  }
}

class TestNetworkStack implements Partial<NetworkStack> {
  socket = new TestUdpSocket();

  async openUdp(options = {}) {
    expect(options).toEqual({ port: DHCP_SERVER_PORT });
    return this.socket;
  }
}

function createClientMessage({
  mac,
  type,
  xid = 0x12345678,
  ciaddr = '0.0.0.0',
  requestedIP,
  serverIdentifier,
}: {
  mac: string;
  type: number;
  xid?: number;
  ciaddr?: string;
  requestedIP?: string;
  serverIdentifier?: string;
}) {
  const data = new Uint8Array(260);
  const view = new DataView(data.buffer);
  view.setUint8(0, 1);
  view.setUint8(1, 1);
  view.setUint8(2, 6);
  view.setUint32(4, xid);
  data.set(ciaddr.split('.').map(Number), 12);
  data.set(
    mac.split(':').map((part) => Number.parseInt(part, 16)),
    28
  );
  view.setUint32(236, 0x63825363);

  let offset = 240;
  data[offset++] = DhcpOptions.MESSAGE_TYPE;
  data[offset++] = 1;
  data[offset++] = type;

  if (requestedIP) {
    data[offset++] = 50;
    data[offset++] = 4;
    data.set(requestedIP.split('.').map(Number), offset);
    offset += 4;
  }

  if (serverIdentifier) {
    data[offset++] = DhcpOptions.SERVER_IDENTIFIER;
    data[offset++] = 4;
    data.set(serverIdentifier.split('.').map(Number), offset);
    offset += 4;
  }

  data[offset++] = DhcpOptions.END;
  return data.slice(0, offset);
}

async function createTestServer(options = defaultOptions) {
  const stack = new TestNetworkStack();
  const server = new DhcpServer(stack as unknown as NetworkStack, options);
  await server.listen();
  return { server, socket: stack.socket };
}

describe('DhcpServer', () => {
  it('should reserve offered IPs before leases are committed', async () => {
    const { socket } = await createTestServer();

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.DISCOVER,
      })
    );
    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:66',
        type: DhcpMessageTypes.DISCOVER,
      })
    );

    const firstOffer = await socket.nextReplyMessage();
    const secondOffer = await socket.nextReplyMessage();

    expect(firstOffer.type).toBe('OFFER');
    expect(firstOffer.yiaddr).toBe('192.168.1.100');
    expect(secondOffer.type).toBe('OFFER');
    expect(secondOffer.yiaddr).toBe('192.168.1.101');

    await socket.close();
  });

  it('should ack the exact requested IP from this server offer', async () => {
    const { server, socket } = await createTestServer();

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.DISCOVER,
      })
    );
    const offer = await socket.nextReplyMessage();

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.REQUEST,
        requestedIP: offer.yiaddr,
        serverIdentifier: defaultOptions.serverIdentifier,
      })
    );
    const ack = await socket.nextReplyMessage();

    expect(ack.type).toBe('ACK');
    expect(ack.yiaddr).toBe(offer.yiaddr);
    expect(server.leases.get('00:11:22:33:44:55')?.ip).toBe(offer.yiaddr);

    await socket.close();
  });

  it('should ignore requests for another DHCP server', async () => {
    const { socket } = await createTestServer();

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.REQUEST,
        requestedIP: '192.168.1.100',
        serverIdentifier: '192.168.1.254',
      })
    );

    const result = await socket.maybeNextReply();

    expect(result).toBeUndefined();

    await socket.close();
  });

  it('should renew leases using ciaddr', async () => {
    const { server, socket } = await createTestServer();

    server.leases.set('00:11:22:33:44:55', {
      ip: '192.168.1.100',
      mac: '00:11:22:33:44:55',
      expiresAt: Date.now() + 1000,
    });

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.REQUEST,
        ciaddr: '192.168.1.100',
      })
    );
    const ack = await socket.nextReplyMessage();

    expect(ack.type).toBe('ACK');
    expect(ack.yiaddr).toBe('192.168.1.100');
    expect(server.leases.get('00:11:22:33:44:55')!.expiresAt).toBeGreaterThan(
      Date.now() + 1000
    );

    await socket.close();
  });

  it('should not offer an IP when the lease range is exhausted', async () => {
    const { socket } = await createTestServer({
      ...defaultOptions,
      leaseRange: { start: '192.168.1.100', end: '192.168.1.100' },
    });

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.DISCOVER,
      })
    );
    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:66',
        type: DhcpMessageTypes.DISCOVER,
      })
    );

    const offer = await socket.nextReplyMessage();
    const exhaustedReply = await socket.maybeNextReply();

    expect(offer.type).toBe('OFFER');
    expect(offer.yiaddr).toBe('192.168.1.100');
    expect(exhaustedReply).toBeUndefined();

    await socket.close();
  });

  it('should nak requests for IPs outside the lease range', async () => {
    const { socket } = await createTestServer();

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.REQUEST,
        requestedIP: '192.168.1.200',
        serverIdentifier: defaultOptions.serverIdentifier,
      })
    );
    const nak = await socket.nextReplyMessage();

    expect(nak.type).toBe('NAK');
    expect(nak.yiaddr).toBe('0.0.0.0');

    await socket.close();
  });

  it('should nak requests for IPs offered to another client', async () => {
    const { socket } = await createTestServer();

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.DISCOVER,
      })
    );
    const offer = await socket.nextReplyMessage();

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:66',
        type: DhcpMessageTypes.REQUEST,
        requestedIP: offer.yiaddr,
        serverIdentifier: defaultOptions.serverIdentifier,
      })
    );
    const nak = await socket.nextReplyMessage();

    expect(nak.type).toBe('NAK');
    expect(nak.yiaddr).toBe('0.0.0.0');

    await socket.close();
  });

  it('should release leases so IPs can be offered again', async () => {
    const { server, socket } = await createTestServer({
      ...defaultOptions,
      leaseRange: { start: '192.168.1.100', end: '192.168.1.100' },
    });

    server.leases.set('00:11:22:33:44:55', {
      ip: '192.168.1.100',
      mac: '00:11:22:33:44:55',
      expiresAt: Date.now() + 60_000,
    });

    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:55',
        type: DhcpMessageTypes.RELEASE,
      })
    );
    socket.receive(
      createClientMessage({
        mac: '00:11:22:33:44:66',
        type: DhcpMessageTypes.DISCOVER,
      })
    );
    const offer = await socket.nextReplyMessage();

    expect(server.leases.has('00:11:22:33:44:55')).toBe(false);
    expect(offer.type).toBe('OFFER');
    expect(offer.yiaddr).toBe('192.168.1.100');

    await socket.close();
  });
});
