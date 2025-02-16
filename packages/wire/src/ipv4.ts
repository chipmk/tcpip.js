import {
  serializeIcmpMessage,
  parseIcmpMessage,
  type IcmpMessage,
} from './icmp.js';
import {
  serializeUdpDatagram,
  parseUdpDatagram,
  UDP_HEADER_LENGTH,
  type UdpDatagram,
} from './udp.js';
import { calculateChecksum } from './util.js';

export type IPv4Address = `${number}.${number}.${number}.${number}`;
export type IPv4Cidr = `${IPv4Address}/${number}`;

export type IPv4PacketBase = {
  version: number;
  dscp: number;
  ecn: number;
  identification: number;
  flags: number;
  fragmentOffset: number;
  ttl: number;
  protocol: string;
  sourceIP: IPv4Address;
  destinationIP: IPv4Address;
};

export type IcmpIPv4Packet = IPv4PacketBase & {
  protocol: 'icmp';
  payload: IcmpMessage;
};

export type TcpIPv4Packet = IPv4PacketBase & {
  protocol: 'tcp';
  payload: Uint8Array;
};

export type UdpIPv4Packet = IPv4PacketBase & {
  protocol: 'udp';
  payload: UdpDatagram;
};

export type IPv4Packet = IcmpIPv4Packet | TcpIPv4Packet | UdpIPv4Packet;

export type IPv4Protocol = IPv4Packet['protocol'];

export type IPv4PseudoHeader = {
  sourceIP: IPv4Address;
  destinationIP: IPv4Address;
  protocol: IPv4Protocol;
  length: number;
};

export const IPV4_HEADER_LENGTH = 20;

/**
 * Parses an IPv4 packet into an object.
 */
export function parseIPv4Packet(data: Uint8Array): IPv4Packet {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const headerChecksum = dataView.getUint16(10);
  const header = data.subarray(0, IPV4_HEADER_LENGTH);

  if (calculateChecksum(header, 10) !== headerChecksum) {
    throw new Error('invalid ipv4 checksum');
  }

  const totalLength = dataView.getUint16(2);

  if (totalLength !== data.length) {
    throw new Error('invalid ipv4 total length');
  }

  const versionAndHeaderLength = dataView.getUint8(0);
  const version = versionAndHeaderLength >> 4;
  const headerLength = (versionAndHeaderLength & 0xf) * 4;
  const dscp = dataView.getUint8(1) >> 2;
  const ecn = dataView.getUint8(1) & 0x3;
  const identification = dataView.getUint16(4);
  const flags = dataView.getUint8(6) >> 5;
  const fragmentOffset =
    ((dataView.getUint8(6) & 0x1f) << 8) | dataView.getUint8(7);
  const ttl = dataView.getUint8(8);
  const protocol = parseIPv4Protocol(dataView.getUint8(9));
  const sourceIP = parseIPv4Address(data.subarray(12, 16));
  const destinationIP = parseIPv4Address(data.subarray(16, 20));
  const payload = data.subarray(headerLength);

  switch (protocol) {
    case 'icmp':
      return {
        version,
        dscp,
        ecn,
        identification,
        flags,
        fragmentOffset,
        ttl,
        protocol,
        sourceIP,
        destinationIP,
        payload: parseIcmpMessage(payload),
      };
    case 'tcp':
      return {
        version,
        dscp,
        ecn,
        identification,
        flags,
        fragmentOffset,
        ttl,
        protocol,
        sourceIP,
        destinationIP,
        payload,
      };
    case 'udp':
      return {
        version,
        dscp,
        ecn,
        identification,
        flags,
        fragmentOffset,
        ttl,
        protocol,
        sourceIP,
        destinationIP,
        payload: parseUdpDatagram(
          payload,
          serializeIPv4PseudoHeader({
            sourceIP,
            destinationIP,
            protocol,
            length: payload.length,
          })
        ),
      };
    default:
      throw new Error('unknown ipv4 protocol');
  }
}

/**
 * Serializes an IPv4 packet from an `IPv4Packet` object.
 */
export function serializeIPv4Packet(packet: IPv4Packet): Uint8Array {
  let payload: Uint8Array;

  switch (packet.protocol) {
    case 'icmp':
      payload = serializeIcmpMessage(packet.payload);
      break;
    case 'tcp':
      payload = packet.payload;
      break;
    case 'udp':
      payload = serializeUdpDatagram(packet.payload, {
        sourceIP: packet.sourceIP,
        destinationIP: packet.destinationIP,
        protocol: packet.protocol,
        length: UDP_HEADER_LENGTH + packet.payload.payload.length,
      });
      break;
    default:
      throw new Error('unknown ipv4 protocol');
  }

  const data = new Uint8Array(IPV4_HEADER_LENGTH + payload.length);
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const totalLength = IPV4_HEADER_LENGTH + payload.length;

  dataView.setUint8(0, (packet.version << 4) | (IPV4_HEADER_LENGTH / 4));
  dataView.setUint8(1, (packet.dscp << 2) | packet.ecn);
  dataView.setUint16(2, totalLength);
  dataView.setUint16(4, packet.identification);
  dataView.setUint8(6, (packet.flags << 5) | (packet.fragmentOffset >> 8));
  dataView.setUint8(7, packet.fragmentOffset & 0xff);
  dataView.setUint8(8, packet.ttl);
  dataView.setUint8(9, serializeIPv4Protocol(packet.protocol));

  data.set(serializeIPv4Address(packet.sourceIP), 12);
  data.set(serializeIPv4Address(packet.destinationIP), 16);

  // Checksum applies to just the header
  const header = data.subarray(0, IPV4_HEADER_LENGTH);
  const checksum = calculateChecksum(header, 10);
  dataView.setUint16(10, checksum);

  data.set(payload, 20);

  return data;
}

/**
 * Parses an IPv4 address Uint8Array into a string.
 */
export function parseIPv4Address(data: Uint8Array) {
  return data.join('.') as IPv4Address;
}

/**
 * Serialize an IPv4 address string into a Uint8Array.
 */
export function serializeIPv4Address(ip: string) {
  return new Uint8Array(ip.split('.').map((byte) => parseInt(byte, 10)));
}

export function parseIPv4Protocol(protocol: number) {
  switch (protocol) {
    case 1:
      return 'icmp';
    case 6:
      return 'tcp';
    case 17:
      return 'udp';
    default:
      throw new Error('unknown ipv4 protocol');
  }
}

export function serializeIPv4Protocol(protocol: IPv4Protocol) {
  switch (protocol) {
    case 'icmp':
      return 1;
    case 'tcp':
      return 6;
    case 'udp':
      return 17;
    default:
      throw new Error('unknown ipv4 protocol');
  }
}

/**
 * Serialize a CIDR notation string into an object with a
 * Uint8Array IP address and netmask.
 */
export function serializeIPv4Cidr(cidr: IPv4Cidr) {
  const [ipString, maskSizeString] = cidr.split('/');

  if (!ipString || !maskSizeString) {
    throw new Error('invalid cidr');
  }

  const maskSize = parseInt(maskSizeString, 10);
  const netmask = generateNetmask(maskSize);

  return {
    ipAddress: serializeIPv4Address(ipString),
    netmask,
  };
}

/**
 * Generates a netmask from a mask size.
 */
export function generateNetmask(maskSize: number) {
  const mask = new Uint8Array(4);

  for (let i = 0; i < maskSize; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    const maskByte = mask[byteIndex];
    if (maskByte === undefined) {
      throw new Error('invalid mask size');
    }
    mask[byteIndex] = maskByte | (1 << bitIndex);
  }

  return mask;
}

/**
 * Serializes a pseudo header for use in calculating transport layer checksums.
 */
export function serializeIPv4PseudoHeader(pseudoHeader: IPv4PseudoHeader) {
  const buffer = new Uint8Array(12);
  const dataView = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  const sourceIPBuffer = serializeIPv4Address(pseudoHeader.sourceIP);
  const destinationIPBuffer = serializeIPv4Address(pseudoHeader.destinationIP);
  const protocolNumber = serializeIPv4Protocol(pseudoHeader.protocol);

  buffer.set(sourceIPBuffer, 0);
  buffer.set(destinationIPBuffer, 4);
  dataView.setUint8(8, 0);
  dataView.setUint8(9, protocolNumber);
  dataView.setUint16(10, pseudoHeader.length);

  return buffer;
}
