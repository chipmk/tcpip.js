import { describe, expect, test } from 'vitest';
import {
  MAX_WINDOW_SIZE,
  READABLE_HIGH_WATER_MARK,
  SEND_BUFFER_SIZE,
} from './bindings/tcp.js';
import {
  createStack,
  LoopbackInterface,
  TapInterface,
  TunInterface,
} from './index.js';
import {
  createEthernetFrame,
  parseEthernetFrame,
} from './protocols/ethernet.js';
import { createIPv4Packet, parseIPv4Packet } from './protocols/ipv4.js';

describe('general', () => {
  test('loopback interface is created by default', async () => {
    const stack = await createStack();
    expect(Array.from(stack.interfaces)).toHaveLength(1);
  });

  test('can create a stack without a loopback interface', async () => {
    const stack = await createStack({ initializeLoopback: false });
    expect(Array.from(stack.interfaces)).toStrictEqual([]);
  });

  test('interface instances are available in interfaces property', async () => {
    const stack = await createStack({ initializeLoopback: false });

    const loopbackInterface = await stack.createLoopbackInterface({
      ip: '127.0.0.1/8',
    });

    const firstInterface = await nextValue(stack.interfaces);
    expect(firstInterface).toBe(loopbackInterface);
  });

  test('add and remove interfaces', async () => {
    const stack = await createStack({ initializeLoopback: false });

    const loopbackInterface = await stack.createLoopbackInterface({
      ip: '127.0.0.1/8',
    });

    const tunInterface = await stack.createTunInterface({
      ip: '192.168.1.1/24',
    });

    const tapInterface = await stack.createTapInterface({
      mac: '00:1a:2b:3c:4d:5e',
      ip: '192.168.2.1/24',
    });

    expect(Array.from(stack.interfaces)).toStrictEqual([
      loopbackInterface,
      tunInterface,
      tapInterface,
    ]);

    await stack.removeInterface(loopbackInterface);

    expect(Array.from(stack.interfaces)).toStrictEqual([
      tunInterface,
      tapInterface,
    ]);

    await stack.removeInterface(tunInterface);

    expect(Array.from(stack.interfaces)).toStrictEqual([tapInterface]);

    await stack.removeInterface(tapInterface);

    expect(Array.from(stack.interfaces)).toStrictEqual([]);
  });
});

describe('createLoopbackInterface', () => {
  test('should create a LoopbackInterface with the given options', async () => {
    const stack = await createStack({ initializeLoopback: false });

    const loopbackInterface = await stack.createLoopbackInterface({
      ip: '127.0.0.1/8',
    });

    expect(loopbackInterface).toBeInstanceOf(LoopbackInterface);
  });
});

describe('createTunInterface', () => {
  test('should create a TunInterface with the given options', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '192.168.1.1/24',
    });

    expect(tunInterface).toBeInstanceOf(TunInterface);
  });

  test('can send and receive packets', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '192.168.1.1/24',
    });

    const listener = tunInterface.listen();
    const writer = tunInterface.writable.getWriter();

    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const packet = createIPv4Packet({
      version: 4,
      dscp: 0,
      ecn: 0,
      identification: 1,
      flags: 0,
      fragmentOffset: 0,
      ttl: 64,
      sourceIP: '192.168.1.2',
      destinationIP: '192.168.1.1',
      protocol: 'icmp',
      payload: {
        type: 'echo-request',
        identifier: 1,
        sequenceNumber: 0,
        payload,
      },
    });

    // Send an ICMP echo request to 192.168.1.1 from 192.168.1.2
    await writer.write(packet);

    const replyPacket = await waitFor(listener, (packet) => {
      const parsedPacket = parseIPv4Packet(packet);
      return (
        parsedPacket.protocol === 'icmp' &&
        parsedPacket.payload.type === 'echo-reply'
      );
    });

    const parsedPacket = parseIPv4Packet(replyPacket);

    // Expect our tun interface to reply
    expect(parsedPacket.sourceIP).toBe('192.168.1.1');
    expect(parsedPacket.destinationIP).toBe('192.168.1.2');

    if (parsedPacket.protocol !== 'icmp') {
      throw new Error('expected icmp packet');
    }

    expect(parsedPacket.payload.type).toBe('echo-reply');
    expect(parsedPacket.payload.identifier).toBe(1);
    expect(parsedPacket.payload.sequenceNumber).toBe(0);
    expect(parsedPacket.payload.payload).toStrictEqual(payload);
  });
});

describe('createTapInterface', () => {
  test('should create a TapInterface with the given options', async () => {
    const stack = await createStack();

    const tapInterface = await stack.createTapInterface({
      mac: '00:1a:2b:3c:4d:5e',
      ip: '192.168.1.1/24',
    });

    expect(tapInterface).toBeInstanceOf(TapInterface);
  });

  test('can send and receive frames', async () => {
    const stack = await createStack();

    const tapInterface = await stack.createTapInterface({
      mac: '00:1a:2b:3c:4d:5e',
      ip: '192.168.1.1/24',
    });

    // Start listening before sending
    const listener = tapInterface.listen();
    const writer = tapInterface.writable.getWriter();

    // ARP broadcast from 192.168.1.2 asking who has 192.168.1.1
    await writer.write(
      createEthernetFrame({
        destinationMac: 'ff:ff:ff:ff:ff:ff',
        sourceMac: '00:1a:2b:3c:4d:5f',
        type: 'arp',
        payload: {
          hardwareType: 'ethernet',
          protocolType: 'ipv4',
          opcode: 'request',
          senderMac: '00:1a:2b:3c:4d:5f',
          senderIP: '192.168.1.2',
          targetMac: '00:00:00:00:00:00',
          targetIP: '192.168.1.1',
        },
      })
    );

    const replyFrame = await waitFor(listener, (frame) => {
      const parsedFrame = parseEthernetFrame(frame);
      return (
        parsedFrame.type === 'arp' && parsedFrame.payload.opcode === 'reply'
      );
    });

    const parsedFrame = parseEthernetFrame(replyFrame);

    // Expect our tap interface to reply
    expect(parsedFrame.sourceMac).toBe('00:1a:2b:3c:4d:5e');
    expect(parsedFrame.destinationMac).toBe('00:1a:2b:3c:4d:5f');

    if (parsedFrame.type !== 'arp') {
      throw new Error('expected arp frame');
    }

    expect(parsedFrame.payload.opcode).toBe('reply');
    expect(parsedFrame.payload.senderMac).toBe('00:1a:2b:3c:4d:5e');
    expect(parsedFrame.payload.senderIP).toBe('192.168.1.1');
    expect(parsedFrame.payload.targetMac).toBe('00:1a:2b:3c:4d:5f');
    expect(parsedFrame.payload.targetIP).toBe('192.168.1.2');
  });
});

describe('tcp', () => {
  test('can create a TCP server and client', async () => {
    const stack = await createStack();

    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack.connectTcp({
        host: '127.0.0.1',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const inboundReader = inbound.readable.getReader();
    const outboundWriter = outbound.writable.getWriter();

    await outboundWriter.write(data);
    const received = await inboundReader.read();

    expect(received.value).toStrictEqual(data);
  });

  test('can close a TCP connection when reader/writer are unlocked', async () => {
    const stack = await createStack();

    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack.connectTcp({
        host: '127.0.0.1',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    await inbound.close();
    await outbound.close();
  });

  test('can close a TCP connection when reader/writer are locked', async () => {
    const stack = await createStack();

    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack.connectTcp({
        host: '127.0.0.1',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    const outboundWriter = outbound.writable.getWriter();
    const inboundReader = inbound.readable.getReader();

    await outbound.close();
    await inbound.close();

    const writePromise = outboundWriter.write(
      new Uint8Array([0x01, 0x02, 0x03, 0x04])
    );
    const readPromise = inboundReader.read();

    await expect(writePromise).rejects.toThrowError('tcp connection closed');
    await expect(readPromise).rejects.toThrowError('tcp connection closed');
  });

  test('can close a TCP reader and writer', async () => {
    const stack = await createStack();

    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack.connectTcp({
        host: '127.0.0.1',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    const inboundReader = inbound.readable.getReader();
    const outboundWriter = outbound.writable.getWriter();

    await outboundWriter.close();
    await inboundReader.cancel();
  });

  test('throws when iterating over a locked readable stream', async () => {
    const stack = await createStack();

    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8080,
    });

    const [_, inbound] = await Promise.all([
      stack.connectTcp({
        host: '127.0.0.1',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    // Lock the readable stream
    inbound.readable.getReader();

    expect(collect(inbound)).rejects.toThrowError(
      'readable stream already locked'
    );
  });

  test('tcp backpressure', async () => {
    const stack = await createStack();

    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack.connectTcp({
        host: '127.0.0.1',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    const inboundReader = inbound.readable.getReader();
    const outboundWriter = outbound.writable.getWriter();

    // To simulate backpressure, we need to fill the TCP stack's send buffer,
    // the peer's TCP receive window, and the peer's readable stream buffer
    const data = new Uint8Array(
      SEND_BUFFER_SIZE + MAX_WINDOW_SIZE + READABLE_HIGH_WATER_MARK
    );

    // Fill all the buffers
    await outboundWriter.write(data);

    // Now create a single byte of overflow data
    const overflowData = new Uint8Array(1);

    // Send the overflow data to see if backpressure is being applied
    let isWritePending = true;
    outboundWriter.write(overflowData).then(() => {
      isWritePending = false;
    });

    // Wait to ensure enough time has passed for the TCP stack
    // to process the data
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(isWritePending).toBe(true);

    // Drain the readable stream buffer, signaling a window update
    await inboundReader.read();

    // Wait to ensure enough time has passed for the TCP stack
    // to process the window update and send the overflow data
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(isWritePending).toBe(false);
  });

  test('communication between stacks via tun', async () => {
    const stack1 = await createStack();
    const stack2 = await createStack();

    const tun1 = await stack1.createTunInterface({
      ip: '192.168.1.1/24',
    });

    const tun2 = await stack2.createTunInterface({
      ip: '192.168.1.2/24',
    });

    // Connect the two interfaces
    tun1.readable.pipeTo(tun2.writable);
    tun2.readable.pipeTo(tun1.writable);

    const listener = await stack2.listenTcp({
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack1.connectTcp({
        host: '192.168.1.2',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    const inboundReader = inbound.readable.getReader();
    const outboundWriter = outbound.writable.getWriter();

    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    await outboundWriter.write(data);
    const received = await inboundReader.read();

    expect(received.value).toStrictEqual(data);
  });

  test('communication between stacks via tap', async () => {
    const stack1 = await createStack();
    const stack2 = await createStack();

    const tap1 = await stack1.createTapInterface({
      mac: '00:1a:2b:3c:4d:5e',
      ip: '192.168.1.1/24',
    });

    const tap2 = await stack2.createTapInterface({
      mac: '00:1a:2b:3c:4d:5f',
      ip: '192.168.1.2/24',
    });

    // Connect the two interfaces
    tap1.readable.pipeTo(tap2.writable);
    tap2.readable.pipeTo(tap1.writable);

    const listener = await stack2.listenTcp({
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack1.connectTcp({
        host: '192.168.1.2',
        port: 8080,
      }),
      nextValue(listener),
    ]);

    const inboundReader = inbound.readable.getReader();
    const outboundWriter = outbound.writable.getWriter();

    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    await outboundWriter.write(data);
    const received = await inboundReader.read();

    expect(received.value).toStrictEqual(data);
  });
});

async function nextValue<T>(iterable: Iterable<T> | AsyncIterable<T>) {
  const iterator =
    Symbol.asyncIterator in iterable
      ? iterable[Symbol.asyncIterator]()
      : iterable[Symbol.iterator]();

  const { value, done } = await iterator.next();
  if (done) {
    throw new Error('iterator done');
  }
  return value;
}

async function collect<T>(iterable: AsyncIterable<T>) {
  const values = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

async function waitFor<T>(
  iterator: AsyncIterator<T>,
  predicate: (value: T) => boolean
) {
  while (true) {
    const { value, done } = await iterator.next();
    if (done) {
      throw new Error('iterator done');
    }
    if (predicate(value)) {
      return value;
    }
  }
}
