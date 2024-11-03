import { createArpMessage, parseArpMessage, type ArpMessage } from './arp.js';
import { createIPv4Packet, parseIPv4Packet, type IPv4Packet } from './ipv4.js';

export type MacAddress =
  `${number}:${number}:${number}:${number}:${number}:${number}`;

export type EthernetFrameBase = {
  destinationMac: MacAddress;
  sourceMac: MacAddress;
};

export type IPv4EthernetFrame = EthernetFrameBase & {
  type: 'ipv4';
  payload: IPv4Packet;
};

export type ARPEthernetFrame = EthernetFrameBase & {
  type: 'arp';
  payload: ArpMessage;
};

// TODO: IPv6EthernetFrame
export type EthernetFrame = IPv4EthernetFrame | ARPEthernetFrame;

/**
 * Parses an Ethernet frame into an object.
 */
export function parseEthernetFrame(frame: Uint8Array): EthernetFrame {
  const destinationMacBytes = frame.subarray(0, 6);
  const sourceMacBytes = frame.subarray(6, 12);
  const typeBytes = frame.subarray(12, 14);
  const payload = frame.subarray(14);

  const destinationMac = formatMacAddress(destinationMacBytes);
  const sourceMac = formatMacAddress(sourceMacBytes);
  const type = parseEthernetType(typeBytes);

  switch (type) {
    case 'ipv4':
      return {
        destinationMac,
        sourceMac,
        type,
        payload: parseIPv4Packet(payload),
      };
    case 'arp':
      return {
        destinationMac,
        sourceMac,
        type,
        payload: parseArpMessage(payload),
      };
    default:
      throw new Error('unknown ethernet type');
  }
}

/**
 * Serializes an Ethernet frame from a Frame object.
 */
export function createEthernetFrame(frame: EthernetFrame): Uint8Array {
  let payload: Uint8Array;

  switch (frame.type) {
    case 'ipv4':
      payload = createIPv4Packet(frame.payload);
      break;
      break;
    case 'arp':
      payload = createArpMessage(frame.payload);
      break;
    default:
      throw new Error('unknown ethernet type');
  }

  const data = new Uint8Array(14 + payload.length);

  data.set(parseMacAddress(frame.destinationMac), 0);
  data.set(parseMacAddress(frame.sourceMac), 6);
  data.set(createEthernetType(frame.type), 12);
  data.set(payload, 14);

  return data;
}

/**
 * Formats a MAC address Uint8Array into a string.
 */
export function formatMacAddress(mac: Uint8Array) {
  if (mac.length !== 6) {
    throw new Error('invalid mac address');
  }

  return Array.from(mac)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':') as MacAddress;
}

/**
 * Parses a MAC address string into a Uint8Array.
 */
export function parseMacAddress(mac: string) {
  const segments = mac.split(':');

  if (segments.length !== 6) {
    throw new Error('invalid mac address');
  }

  return new Uint8Array(
    segments.map((byte) => {
      const parsed = parseInt(byte, 16);
      if (Number.isNaN(parsed)) {
        throw new Error('invalid mac address');
      }
      return parsed;
    })
  );
}

/**
 * Parses an Ethernet type into a string.
 */
export function parseEthernetType(etherType: Uint8Array) {
  const dataView = new DataView(
    etherType.buffer,
    etherType.byteOffset,
    etherType.byteLength
  );

  const type = dataView.getUint16(0);

  switch (type) {
    case 0x0800:
      return 'ipv4';
    case 0x86dd:
      return 'ipv6';
    case 0x0806:
      return 'arp';
    default:
      throw new Error('unknown ethernet type');
  }
}

/**
 * Serializes an Ethernet type from a string.
 */
export function createEthernetType(type: 'ipv4' | 'ipv6' | 'arp') {
  const data = new Uint8Array(2);
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  switch (type) {
    case 'ipv4':
      dataView.setUint16(0, 0x0800);
      break;
    case 'ipv6':
      dataView.setUint16(0, 0x86dd);
      break;
    case 'arp':
      dataView.setUint16(0, 0x0806);
      break;
    default:
      throw new Error('unknown ethernet type');
  }

  return data;
}
