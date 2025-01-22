import { describe, expect, it } from 'vitest';
import { serializeIPv4PseudoHeader } from './ipv4.js';
import { createUdpDatagram, parseUdpDatagram, type UdpDatagram } from './udp';

describe('parseUdpDatagram', () => {
  it('should parse a valid UDP datagram', () => {
    const data = new Uint8Array([
      0x00,
      0x50, // sourcePort: 80
      0x01,
      0xbb, // destinationPort: 443
      0x00,
      0x0c, // length: 12
      0xdc,
      0xd9, // checksum: 0xdcd9
      0xde,
      0xad,
      0xbe,
      0xef, // payload
    ]);

    const result = parseUdpDatagram(
      data,
      serializeIPv4PseudoHeader({
        sourceIP: '192.168.1.1',
        destinationIP: '192.168.1.2',
        protocol: 'udp',
        length: 12,
      })
    );

    expect(result).toEqual({
      sourcePort: 80,
      destinationPort: 443,
      payload: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    });
  });

  it('should handle an empty payload', () => {
    const data = new Uint8Array([
      0x00,
      0x50, // sourcePort: 80
      0x01,
      0xbb, // destinationPort: 443
      0x00,
      0x08, // length: 8
      0x7a,
      0x7f, // checksum: 0x7a7f
    ]);

    const result = parseUdpDatagram(
      data,
      serializeIPv4PseudoHeader({
        sourceIP: '192.168.1.1',
        destinationIP: '192.168.1.2',
        protocol: 'udp',
        length: 8,
      })
    );

    expect(result).toEqual({
      sourcePort: 80,
      destinationPort: 443,
      payload: new Uint8Array([]),
    });
  });

  it('should verify the UDP checksum if the IP packet is provided', () => {
    const udpDatagram = new Uint8Array([
      0x00,
      0x50, // sourcePort: 80
      0x01,
      0xbb, // destinationPort: 443
      0x00,
      0x08, // length: 8
      0x7a,
      0x7f, // checksum: 0x7a7f
    ]);

    const pseudoHeader = serializeIPv4PseudoHeader({
      sourceIP: '192.168.1.1',
      destinationIP: '192.168.1.2',
      protocol: 'udp',
      length: udpDatagram.length,
    });

    expect(() => parseUdpDatagram(udpDatagram, pseudoHeader)).not.toThrow();
  });

  it('should throw an error if the UDP checksum is invalid', () => {
    const udpDatagram = new Uint8Array([
      0x00,
      0x50, // sourcePort: 80
      0x01,
      0xbb, // destinationPort: 443
      0x00,
      0x08, // length: 8
      0x12,
      0x34, // checksum: 0x1234
    ]);

    const pseudoHeader = serializeIPv4PseudoHeader({
      sourceIP: '192.168.1.1',
      destinationIP: '192.168.1.2',
      protocol: 'udp',
      length: udpDatagram.length,
    });

    expect(() => parseUdpDatagram(udpDatagram, pseudoHeader)).toThrow();
  });

  it('should throw an error if data length is less than UDP header length', () => {
    const data = new Uint8Array([0x00, 0x50, 0x01, 0xbb, 0x00, 0x08]);

    expect(() => parseUdpDatagram(data)).toThrow();
  });
});

describe('createUdpDatagram', () => {
  it('should create a valid UDP datagram', () => {
    const datagram: UdpDatagram = {
      sourcePort: 80,
      destinationPort: 443,
      payload: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    };

    const result = createUdpDatagram(datagram, {
      sourceIP: '192.168.1.1',
      destinationIP: '192.168.1.2',
      protocol: 'udp',
      length: 12,
    });

    expect(result).toEqual(
      new Uint8Array([
        0x00,
        0x50, // sourcePort: 80
        0x01,
        0xbb, // destinationPort: 443
        0x00,
        0x0c, // length: 12
        0xdc,
        0xd9, // checksum: 0xdcd9
        0xde,
        0xad,
        0xbe,
        0xef, // payload
      ])
    );
  });

  it('should handle an empty payload', () => {
    const datagram: UdpDatagram = {
      sourcePort: 80,
      destinationPort: 443,
      payload: new Uint8Array([]),
    };

    const result = createUdpDatagram(datagram, {
      sourceIP: '192.168.1.1',
      destinationIP: '192.168.1.2',
      protocol: 'udp',
      length: 8,
    });

    expect(result).toEqual(
      new Uint8Array([
        0x00,
        0x50, // sourcePort: 80
        0x01,
        0xbb, // destinationPort: 443
        0x00,
        0x08, // length: 8
        0x7a,
        0x7f, // checksum: 0x7a7f
      ])
    );
  });
});
