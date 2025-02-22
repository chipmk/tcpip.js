import { createDns } from '@tcpip/dns';
import {
  parseEthernetFrame,
  parseIPv4Packet,
  serializeEthernetFrame,
  serializeIPv4Packet,
  type IPv4Packet,
} from '@tcpip/wire';
import { describe, expect, test } from 'vitest';
import {
  MAX_WINDOW_SIZE,
  READABLE_HIGH_WATER_MARK,
  SEND_BUFFER_SIZE,
} from './bindings/tcp.js';
import { createStack } from './index.js';

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

describe('loopback interface', () => {
  test('should create a LoopbackInterface with the given options', async () => {
    const stack = await createStack({ initializeLoopback: false });

    const loopbackInterface = await stack.createLoopbackInterface({
      ip: '127.0.0.1/8',
    });

    expect(loopbackInterface.type).toBe('loopback');
  });

  test('can get ip and netmask', async () => {
    const stack = await createStack({ initializeLoopback: false });

    const loopbackInterface = await stack.createLoopbackInterface({
      ip: '127.0.0.1/8',
    });

    expect(loopbackInterface.ip).toBe('127.0.0.1');
    expect(loopbackInterface.netmask).toBe('255.0.0.0');
  });
});

describe('tun interface', () => {
  test('should create a TunInterface with the given options', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '192.168.1.1/24',
    });

    expect(tunInterface.type).toBe('tun');
  });

  test('can send and receive packets', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '192.168.1.1/24',
    });

    const listener = tunInterface.listen();
    const writer = tunInterface.writable.getWriter();

    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const packet = serializeIPv4Packet({
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

  test('can get ip and netmask', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '192.168.1.1/24',
    });

    expect(tunInterface.ip).toBe('192.168.1.1');
    expect(tunInterface.netmask).toBe('255.255.255.0');
  });
});

describe('tap interface', () => {
  test('should create a TapInterface with the given options', async () => {
    const stack = await createStack();

    const tapInterface = await stack.createTapInterface({
      mac: '00:1a:2b:3c:4d:5e',
      ip: '192.168.1.1/24',
    });

    expect(tapInterface.type).toBe('tap');
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
      serializeEthernetFrame({
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

  test('can get mac, ip, and netmask', async () => {
    const stack = await createStack();

    const tapInterface = await stack.createTapInterface({
      mac: '00:1a:2b:3c:4d:5e',
      ip: '192.168.1.1/24',
    });

    expect(tapInterface.mac).toBe('00:1a:2b:3c:4d:5e');
    expect(tapInterface.ip).toBe('192.168.1.1');
    expect(tapInterface.netmask).toBe('255.255.255.0');
  });
});

describe('bridge interface', () => {
  test('should create a BridgeInterface with the given options', async () => {
    const stack = await createStack();

    const port1 = await stack.createTapInterface({
      mac: '02:00:00:00:00:01',
      ip: '192.168.1.2/24',
    });

    const port2 = await stack.createTapInterface({
      mac: '02:00:00:00:00:02',
      ip: '192.168.1.3/24',
    });

    const bridgeInterface = await stack.createBridgeInterface({
      ports: [port1, port2],
      mac: '02:00:00:00:00:00',
      ip: '192.168.1.1/24',
    });

    expect(bridgeInterface.type).toBe('bridge');
  });

  test('frames are forwarded between ports', async () => {
    // Create a network of two devices connected to a router
    const device1 = await createStack();
    const device2 = await createStack();
    const router = await createStack();

    const device1Tap = await device1.createTapInterface({
      ip: '192.168.1.2/24',
    });

    const device2Tap = await device2.createTapInterface({
      ip: '192.168.1.3/24',
    });

    const port1 = await router.createTapInterface();
    const port2 = await router.createTapInterface();

    // Bridge the two router ports
    await router.createBridgeInterface({
      ports: [port1, port2],
      ip: '192.168.1.1/24',
    });

    // Connect device 1 to port 1
    device1Tap.readable.pipeTo(port1.writable);
    port1.readable.pipeTo(device1Tap.writable);

    // Connect device 2 to port 2
    device2Tap.readable.pipeTo(port2.writable);
    port2.readable.pipeTo(device2Tap.writable);

    // Listen on device 2
    const listener = await device2.listenTcp({
      port: 8080,
    });

    // Attempt to connect from device 1 to device 2 via bridge
    const connection = await device1.connectTcp({
      host: '192.168.1.3',
      port: 8080,
    });

    // Write data to confirm communication
    const outboundWriter = connection.writable.getWriter();
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    outboundWriter.write(data);

    for await (const inbound of listener) {
      const reader = inbound.readable.getReader();
      const received = await reader.read();

      if (received.done) {
        throw new Error('expected value');
      }

      expect(received.value).toStrictEqual(data);
      break;
    }
  });

  test('bridge interface itself can send and receive frames', async () => {
    // Create a network of two devices connected to a router
    const device = await createStack();
    const router = await createStack();

    const deviceTap = await device.createTapInterface({
      ip: '192.168.1.2/24',
    });

    const port = await router.createTapInterface();

    // Create bridge
    await router.createBridgeInterface({
      ports: [port],
      ip: '192.168.1.1/24',
    });

    // Connect device to port
    deviceTap.readable.pipeTo(port.writable);
    port.readable.pipeTo(deviceTap.writable);

    // Listen on router
    const listener = await router.listenTcp({
      port: 8080,
    });

    // Attempt to connect from device to bridge via port
    const connection = await device.connectTcp({
      host: '192.168.1.1',
      port: 8080,
    });

    // Write data to confirm communication
    const outboundWriter = connection.writable.getWriter();
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    outboundWriter.write(data);

    for await (const inbound of listener) {
      const reader = inbound.readable.getReader();
      const received = await reader.read();

      if (received.done) {
        throw new Error('expected value');
      }

      expect(received.value).toStrictEqual(data);
      break;
    }
  });

  test('can get mac, ip, and netmask', async () => {
    const stack = await createStack();

    const bridgeInterface = await stack.createBridgeInterface({
      ports: [],
      mac: '00:1a:2b:3c:4d:5e',
      ip: '192.168.1.1/24',
    });

    expect(bridgeInterface.mac).toBe('00:1a:2b:3c:4d:5e');
    expect(bridgeInterface.ip).toBe('192.168.1.1');
    expect(bridgeInterface.netmask).toBe('255.255.255.0');
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

    await expect(collect(inbound)).rejects.toThrowError(
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

describe('udp', () => {
  test('can send and receive a UDP datagram', async () => {
    const stack = await createStack();

    const socket1 = await stack.openUdp({ port: 8080 });
    const socket2 = await stack.openUdp({ port: 8081 });

    const reader = socket1.readable.getReader();
    const writer = socket2.writable.getWriter();

    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    await writer.write({ host: '127.0.0.1', port: 8080, data: data });
    const received = await reader.read();

    if (received.done) {
      throw new Error('expected value');
    }

    expect(received.value.host).toBe('127.0.0.1');
    expect(received.value.port).toBe(8081);
    expect(received.value.data).toStrictEqual(data);
  });

  test('can receive udp datagram via tun interface', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '10.0.0.1/24',
    });

    const socket = await stack.openUdp({ port: 8080 });

    const writer = tunInterface.writable.getWriter();
    const reader = socket.readable.getReader();

    const ipv4Packet: IPv4Packet = {
      version: 4,
      dscp: 0,
      ecn: 0,
      identification: 0,
      flags: 0,
      fragmentOffset: 0,
      ttl: 64,
      protocol: 'udp',
      sourceIP: '10.0.0.2',
      destinationIP: '10.0.0.1',
      payload: {
        sourcePort: 8080,
        destinationPort: 8080,
        payload: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
      },
    };

    const packet = serializeIPv4Packet(ipv4Packet);
    await writer.write(packet);

    const received = await reader.read();

    if (received.done) {
      throw new Error('expected value');
    }

    expect(received.value.host).toBe('10.0.0.2');
  });

  test('can send udp datagram via tun interface', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '10.0.0.1/24',
    });

    const socket = await stack.openUdp({ port: 8080 });

    const reader = tunInterface.readable.getReader();
    const writer = socket.writable.getWriter();

    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    await writer.write({
      host: '10.0.0.2',
      port: 8080,
      data,
    });

    const received = await reader.read();

    if (received.done) {
      throw new Error('expected value');
    }

    const parsedPacket = parseIPv4Packet(received.value);

    if (parsedPacket.protocol !== 'udp') {
      throw new Error('expected udp packet');
    }

    expect(parsedPacket.sourceIP).toBe('10.0.0.1');
    expect(parsedPacket.destinationIP).toBe('10.0.0.2');
    expect(parsedPacket.payload.sourcePort).toBe(8080);
    expect(parsedPacket.payload.destinationPort).toBe(8080);
    expect(parsedPacket.payload.payload).toStrictEqual(data);
  });

  test('can receive broadcast udp datagram', async () => {
    const stack = await createStack();

    const tunInterface = await stack.createTunInterface({
      ip: '10.0.0.1/24',
    });

    const socket = await stack.openUdp({ port: 8080 });

    const reader = socket.readable.getReader();
    const writer = tunInterface.writable.getWriter();

    const ipv4Packet: IPv4Packet = {
      version: 4,
      dscp: 0,
      ecn: 0,
      identification: 0,
      flags: 0,
      fragmentOffset: 0,
      ttl: 64,
      protocol: 'udp',
      sourceIP: '0.0.0.0',
      destinationIP: '255.255.255.255',
      payload: {
        sourcePort: 8080,
        destinationPort: 8080,
        payload: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
      },
    };

    const packet = serializeIPv4Packet(ipv4Packet);
    await writer.write(packet);

    const received = await reader.read();

    if (received.done) {
      throw new Error('expected value');
    }

    expect(received.value.host).toBe('0.0.0.0');
  });

  test('can send broadcast udp datagram', async () => {
    const stack = await createStack();

    const tapInterface = await stack.createTapInterface({
      ip: '10.0.0.1/24',
      mac: '00:1a:2b:3c:4d:5e',
    });

    const socket = await stack.openUdp({ port: 8080 });

    const listener = tapInterface.listen();
    const writer = socket.writable.getWriter();

    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    await writer.write({
      host: '255.255.255.255',
      port: 8080,
      data,
    });

    const received = await waitFor(listener, (frame) => {
      const parsedFrame = parseEthernetFrame(frame);
      return parsedFrame.type === 'ipv4';
    });

    const parsedFrame = parseEthernetFrame(received);

    if (parsedFrame.type !== 'ipv4') {
      throw new Error('expected ipv4 packet');
    }

    const parsedPacket = parsedFrame.payload;

    if (parsedPacket.protocol !== 'udp') {
      throw new Error('expected udp packet');
    }

    expect(parsedPacket.sourceIP).toBe('10.0.0.1');
    expect(parsedPacket.destinationIP).toBe('255.255.255.255');
    expect(parsedPacket.payload.sourcePort).toBe(8080);
    expect(parsedPacket.payload.destinationPort).toBe(8080);
    expect(parsedPacket.payload.payload).toStrictEqual(data);
  });
});

describe('dns', () => {
  test('can resolve a hostname during udp bind and send', async () => {
    const stack = await createStack();
    const { serve } = await createDns(stack);

    await serve({
      request: async ({ name, type }) => {
        if (name === 'example.com' && type === 'A') {
          return {
            type,
            ip: '127.0.0.1',
            ttl: 300,
          };
        }
      },
    });

    const socket1 = await stack.openUdp({ host: 'example.com', port: 8080 });
    const socket2 = await stack.openUdp({ port: 8081 });

    const reader = socket1.readable.getReader();
    const writer = socket2.writable.getWriter();

    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    await writer.write({ host: 'example.com', port: 8080, data: data });
    const received = await reader.read();

    if (received.done) {
      throw new Error('expected value');
    }

    expect(received.value.host).toBe('127.0.0.1');
    expect(received.value.port).toBe(8081);
    expect(received.value.data).toStrictEqual(data);
  });

  test('can resolve a hostname during tcp bind and connection', async () => {
    const stack = await createStack();
    const { serve } = await createDns(stack);

    await serve({
      request: async ({ name, type }) => {
        if (name === 'example.com' && type === 'A') {
          return {
            type,
            ip: '127.0.0.1',
            ttl: 300,
          };
        }
      },
    });

    const listener = await stack.listenTcp({
      host: 'example.com',
      port: 8080,
    });

    const [outbound, inbound] = await Promise.all([
      stack.connectTcp({
        host: 'example.com',
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
