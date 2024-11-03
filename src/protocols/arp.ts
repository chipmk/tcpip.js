import {
  formatMacAddress,
  parseMacAddress,
  type MacAddress,
} from './ethernet.js';
import {
  formatIPv4Address,
  parseIPv4Address,
  type IPv4Address,
} from './ipv4.js';

export type ArpMessage = {
  hardwareType: string;
  protocolType: string;
  opcode: string;
  senderMac: MacAddress;
  senderIP: IPv4Address;
  targetMac: MacAddress;
  targetIP: IPv4Address;
};

/**
 * Parses an ARP message packet into an object.
 */
export function parseArpMessage(data: Uint8Array): ArpMessage {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const hardwareType = parseHardwareType(dataView.getUint16(0));
  const protocolType = parseProtocolType(dataView.getUint16(2));
  const opcode = parseOpcode(dataView.getUint16(6));
  const senderMac = formatMacAddress(data.subarray(8, 14));
  const senderIP = formatIPv4Address(data.subarray(14, 18));
  const targetMac = formatMacAddress(data.subarray(18, 24));
  const targetIP = formatIPv4Address(data.subarray(24, 28));

  return {
    hardwareType,
    protocolType,
    opcode,
    senderMac,
    senderIP,
    targetMac,
    targetIP,
  };
}

/**
 * Serializes an ARP message packet from an `ArpMessage` object.
 */
export function createArpMessage(request: ArpMessage): Uint8Array {
  const data = new Uint8Array(28);
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  dataView.setUint16(0, createHardwareType(request.hardwareType));
  dataView.setUint16(2, createProtocolType(request.protocolType));
  dataView.setUint8(4, 6);
  dataView.setUint8(5, 4);
  dataView.setUint16(6, createOpcode(request.opcode));
  data.set(parseMacAddress(request.senderMac), 8);
  data.set(parseIPv4Address(request.senderIP), 14);
  data.set(parseMacAddress(request.targetMac), 18);
  data.set(parseIPv4Address(request.targetIP), 24);

  return data;
}

export function parseHardwareType(hardwareType: number) {
  switch (hardwareType) {
    case 1:
      return 'ethernet';
    default:
      throw new Error('unknown hardware type');
  }
}

export function createHardwareType(hardwareType: string) {
  switch (hardwareType) {
    case 'ethernet':
      return 1;
    default:
      throw new Error('unknown hardware type');
  }
}

export function parseProtocolType(protocolType: number) {
  switch (protocolType) {
    case 0x0800:
      return 'ipv4';
    default:
      throw new Error('unknown protocol type');
  }
}

export function createProtocolType(protocolType: string) {
  switch (protocolType) {
    case 'ipv4':
      return 0x0800;
    default:
      throw new Error('unknown protocol type');
  }
}

export function parseOpcode(opcode: number) {
  switch (opcode) {
    case 1:
      return 'request';
    case 2:
      return 'reply';
    default:
      throw new Error('unknown opcode');
  }
}

export function createOpcode(opcode: string) {
  switch (opcode) {
    case 'request':
      return 1;
    case 'reply':
      return 2;
    default:
      throw new Error('unknown opcode');
  }
}
