import {
  type EthernetFrame,
  parseEthernetFrame,
  serializeEthernetFrame,
} from '@tcpip/wire';
import { createStack } from 'tcpip';
import { describe, expect, it } from 'vitest';
import { DHCP_CLIENT_PORT, DHCP_SERVER_PORT } from './constants.js';
import { createDhcp } from './index.js';
import { parseDhcpMessage } from './wire.js';

const clientMac = '02:00:00:00:00:02';

function getOptionData(message: Uint8Array, optionCode: number) {
  let offset = 240;
  while (offset < message.length) {
    const option = message[offset];
    if (option === 255) {
      return;
    }
    if (option === 0) {
      offset += 1;
      continue;
    }

    const length = message[offset + 1]!;
    const dataOffset = offset + 2;
    if (option === optionCode) {
      return message.subarray(dataOffset, dataOffset + length);
    }
    offset = dataOffset + length;
  }
}

function createDhcpClientMessage({
  type,
  xid = 0x12345678,
  requestedIP,
  serverIdentifier,
}: {
  type: number;
  xid?: number;
  requestedIP?: string;
  serverIdentifier?: string;
}) {
  const data = new Uint8Array(260);
  const view = new DataView(data.buffer);
  view.setUint8(0, 1);
  view.setUint8(1, 1);
  view.setUint8(2, 6);
  view.setUint32(4, xid);
  data.set(
    clientMac.split(':').map((part) => Number.parseInt(part, 16)),
    28
  );
  view.setUint32(236, 0x63825363);

  let offset = 240;
  data[offset++] = 53;
  data[offset++] = 1;
  data[offset++] = type;

  if (requestedIP) {
    data[offset++] = 50;
    data[offset++] = 4;
    data.set(requestedIP.split('.').map(Number), offset);
    offset += 4;
  }

  if (serverIdentifier) {
    data[offset++] = 54;
    data[offset++] = 4;
    data.set(serverIdentifier.split('.').map(Number), offset);
    offset += 4;
  }

  data[offset++] = 255;
  return data.slice(0, offset);
}

function createClientFrame(payload: Uint8Array): Uint8Array {
  const frame: EthernetFrame = {
    destinationMac: 'ff:ff:ff:ff:ff:ff',
    sourceMac: clientMac,
    type: 'ipv4',
    payload: {
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
        sourcePort: DHCP_CLIENT_PORT,
        destinationPort: DHCP_SERVER_PORT,
        payload,
      },
    },
  };

  return serializeEthernetFrame(frame);
}

async function waitForDhcpReply(iterator: AsyncIterator<Uint8Array>) {
  return await Promise.race([
    (async () => {
      while (true) {
        const { value, done } = await iterator.next();
        if (done) {
          throw new Error('iterator done');
        }

        const frame = parseEthernetFrame(value);
        if (frame.type !== 'ipv4' || frame.payload.protocol !== 'udp') {
          continue;
        }

        const udp = frame.payload.payload;
        if (udp.destinationPort === DHCP_CLIENT_PORT) {
          return {
            message: parseDhcpMessage(udp.payload),
            payload: udp.payload,
          };
        }
      }
    })(),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('timed out waiting for DHCP reply')),
        1_000
      );
    }),
  ]);
}

describe('DhcpServer with tcpip stack', () => {
  it('should complete discover/request over UDP broadcast', async () => {
    const stack = await createStack();
    const tapInterface = await stack.createTapInterface({
      ip: '192.168.1.1/24',
      mac: '02:00:00:00:00:01',
    });
    const dhcp = await createDhcp(stack);
    const dhcpServer = await dhcp.serve({
      leaseRange: { start: '192.168.1.100', end: '192.168.1.110' },
      leaseDuration: 3600,
      serverIdentifier: '192.168.1.1',
      netmask: '255.255.255.0',
      router: '192.168.1.1',
    });

    const listener = tapInterface.listen();
    const writer = tapInterface.writable.getWriter();

    await writer.write(
      createClientFrame(
        createDhcpClientMessage({
          type: 1,
        })
      )
    );
    const offer = await waitForDhcpReply(listener);

    expect(offer.message.type).toBe('OFFER');
    expect(offer.message.yiaddr).toBe('192.168.1.100');

    await writer.write(
      createClientFrame(
        createDhcpClientMessage({
          type: 3,
          requestedIP: offer.message.yiaddr,
          serverIdentifier: '192.168.1.1',
        })
      )
    );
    const ack = await waitForDhcpReply(listener);

    expect(ack.message.type).toBe('ACK');
    expect(ack.message.yiaddr).toBe(offer.message.yiaddr);
    expect(dhcpServer.leases.get(clientMac)?.ip).toBe(offer.message.yiaddr);
  });

  it('should advertise configured DNS servers', async () => {
    const stack = await createStack();
    const tapInterface = await stack.createTapInterface({
      ip: '192.168.1.1/24',
      mac: '02:00:00:00:00:01',
    });
    const dhcp = await createDhcp(stack);
    await dhcp.serve({
      leaseRange: { start: '192.168.1.100', end: '192.168.1.110' },
      leaseDuration: 3600,
      serverIdentifier: '192.168.1.1',
      netmask: '255.255.255.0',
      router: '192.168.1.1',
      dnsServers: ['192.168.1.1', '192.168.1.2'],
    });

    const listener = tapInterface.listen();
    const writer = tapInterface.writable.getWriter();

    await writer.write(
      createClientFrame(
        createDhcpClientMessage({
          type: 1,
        })
      )
    );
    const offer = await waitForDhcpReply(listener);

    expect(getOptionData(offer.payload, 6)).toEqual(
      new Uint8Array([192, 168, 1, 1, 192, 168, 1, 2])
    );
  });
});
