import { calculateChecksum } from './util.js';

export type IPv4Address = `${number}.${number}.${number}.${number}`;
export type IPv4Cidr = `${IPv4Address}/${number}`;

export type IPv4Packet = {
  version: number;
  headerLength: number;
  dscp: number;
  ecn: number;
  totalLength: number;
  identification: number;
  flags: number;
  fragmentOffset: number;
  ttl: number;
  protocol: number;
  headerChecksum: number;
  sourceIP: IPv4Address;
  destinationIP: IPv4Address;
  payload: Uint8Array;
};

/**
 * Parses an IPv4 packet into an object.
 */
export function parseIPv4Packet(data: Uint8Array): IPv4Packet {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const versionAndHeaderLength = dataView.getUint8(0);
  const version = versionAndHeaderLength >> 4;
  const headerLength = (versionAndHeaderLength & 0xf) * 4;
  const dscp = dataView.getUint8(1) >> 2;
  const ecn = dataView.getUint8(1) & 0x3;
  const totalLength = dataView.getUint16(2);
  const identification = dataView.getUint16(4);
  const flags = dataView.getUint8(6) >> 5;
  const fragmentOffset =
    ((dataView.getUint8(6) & 0x1f) << 8) | dataView.getUint8(7);
  const ttl = dataView.getUint8(8);
  const protocol = dataView.getUint8(9);
  const headerChecksum = dataView.getUint16(10);
  const sourceIP = parseIPv4Address(data.subarray(12, 16));
  const destinationIP = parseIPv4Address(data.subarray(16, 20));
  const payload = data.subarray(headerLength);

  return {
    version,
    headerLength,
    dscp,
    ecn,
    totalLength,
    identification,
    flags,
    fragmentOffset,
    ttl,
    protocol,
    headerChecksum,
    sourceIP,
    destinationIP,
    payload,
  };
}

/**
 * Serializes an IPv4 packet from an `IPPacket` object.
 */
export function createIPv4Packet(packet: IPv4Packet): Uint8Array {
  const data = new Uint8Array(20 + packet.payload.length);
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const checksum = calculateChecksum(data);

  dataView.setUint8(0, (packet.version << 4) | (packet.headerLength / 4));
  dataView.setUint8(1, (packet.dscp << 2) | packet.ecn);
  dataView.setUint16(2, packet.totalLength);
  dataView.setUint16(4, packet.identification);
  dataView.setUint8(6, (packet.flags << 5) | (packet.fragmentOffset >> 8));
  dataView.setUint8(7, packet.fragmentOffset & 0xff);
  dataView.setUint8(8, packet.ttl);
  dataView.setUint8(9, packet.protocol);
  dataView.setUint16(10, checksum);
  data.set(serializeIPv4Address(packet.sourceIP), 12);
  data.set(serializeIPv4Address(packet.destinationIP), 16);
  data.set(packet.payload, 20);

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
