import { describe, expect, test } from 'vitest';
import {
  LoopbackInterface,
  TapInterface,
  TunInterface,
  createStack,
} from './index.js';
import {
  createEthernetFrame,
  parseEthernetFrame,
} from './protocols/ethernet.js';
import { createIPv4Packet, parseIPv4Packet } from './protocols/ipv4.js';

describe('NetworkStack', () => {
  describe('createLoopbackInterface', () => {
    test('should create a LoopbackInterface with the given options', async () => {
      const stack = await createStack();

      const loopbackInterface = await stack.createLoopbackInterface({
        cidr: '127.0.0.1/8',
      });

      expect(loopbackInterface).toBeInstanceOf(LoopbackInterface);
    });
  });

  describe('createTunInterface', () => {
    test('should create a TunInterface with the given options', async () => {
      const stack = await createStack();

      const tunInterface = await stack.createTunInterface({
        cidr: '192.168.1.1/24',
      });

      expect(tunInterface).toBeInstanceOf(TunInterface);
    });

    test('can send and receive packets', async () => {
      const stack = await createStack();

      const tunInterface = await stack.createTunInterface({
        cidr: '192.168.1.1/24',
      });

      // Start listening before sending
      const listener = tunInterface.listen();

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
      await tunInterface.send(packet);

      const receivedPacket = await getFirstValue(listener);
      const parsedPacket = parseIPv4Packet(receivedPacket);

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
        macAddress: '00:1a:2b:3c:4d:5e',
        cidr: '192.168.1.1/24',
      });

      expect(tapInterface).toBeInstanceOf(TapInterface);
    });

    test('can send and receive frames', async () => {
      const stack = await createStack();

      const tapInterface = await stack.createTapInterface({
        macAddress: '00:1a:2b:3c:4d:5e',
        cidr: '192.168.1.1/24',
      });

      // Start listening before sending
      const listener = tapInterface.listen();

      // ARP broadcast from 192.168.1.2 asking who has 192.168.1.1
      await tapInterface.send(
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

      const receivedFrame = await getFirstValue(listener);
      const parsedFrame = parseEthernetFrame(receivedFrame);

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
});

async function getFirstValue<T>(iterable: AsyncIterable<T>) {
  for await (const value of iterable) {
    return value;
  }
  throw new Error('no values');
}
