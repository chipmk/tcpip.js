import { describe, expect, test } from 'vitest';
import { TapInterface, createStack } from './index.js';
import {
  createEthernetFrame,
  parseEthernetFrame,
} from './protocols/ethernet.js';

describe('NetworkStack', () => {
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
