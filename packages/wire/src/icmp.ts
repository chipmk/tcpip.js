import { calculateChecksum } from './util.js';

export type IcmpMessage = {
  type: string;
  code?: string;
  identifier: number;
  sequenceNumber: number;
  payload: Uint8Array;
};

/**
 * Parses an ICMP message into an object.
 */
export function parseIcmpMessage(data: Uint8Array): IcmpMessage {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const checksum = dataView.getUint16(2);

  if (calculateChecksum(data, 2) !== checksum) {
    throw new Error('invalid icmp checksum');
  }

  const type = parseIcmpType(dataView.getUint8(0));
  const code = parseIcmpCode(type, dataView.getUint8(1));
  const identifier = dataView.getUint16(4);
  const sequenceNumber = dataView.getUint16(6);
  const payload = data.subarray(8);

  return {
    type,
    code,
    identifier,
    sequenceNumber,
    payload,
  };
}

/**
 * Serializes an ICMP message from an `ICMPMessage` object.
 */
export function serializeIcmpMessage(message: IcmpMessage): Uint8Array {
  const data = new Uint8Array(8 + message.payload.length);
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  dataView.setUint8(0, serializeIcmpType(message.type));
  dataView.setUint8(1, serializeIcmpCode(message.type, message.code));
  dataView.setUint16(4, message.identifier);
  dataView.setUint16(6, message.sequenceNumber);
  data.set(message.payload, 8);

  // Checksum applies to both header and payload
  const checksum = calculateChecksum(data, 2);
  dataView.setUint16(2, checksum);

  return data;
}

export function parseIcmpType(type: number) {
  switch (type) {
    case 0:
      return 'echo-reply';
    case 3:
      return 'destination-unreachable';
    case 8:
      return 'echo-request';
    case 11:
      return 'time-exceeded';
    default:
      throw new Error('unknown icmp type');
  }
}

export function serializeIcmpType(type: string) {
  switch (type) {
    case 'echo-reply':
      return 0;
    case 'destination-unreachable':
      return 3;
    case 'echo-request':
      return 8;
    case 'time-exceeded':
      return 11;
    default:
      throw new Error('unknown icmp type');
  }
}

export function parseIcmpCode(type: string, code: number) {
  switch (type) {
    case 'echo-reply':
    case 'echo-request': {
      switch (code) {
        case 0:
          return undefined;
        default:
          throw new Error('unknown icmp code');
      }
    }
    case 'destination-unreachable': {
      switch (code) {
        case 0:
          return 'network-unreachable';
        case 1:
          return 'host-unreachable';
        case 2:
          return 'protocol-unreachable';
        default:
          throw new Error('unknown icmp code');
      }
    }
    case 'time-exceeded':
      switch (code) {
        case 0:
          return 'ttl-exceeded';
        case 1:
          return 'fragment-reassembly-time-exceeded';
        default:
          throw new Error('unknown icmp code');
      }
    default:
      throw new Error('unknown icmp code');
  }
}

export function serializeIcmpCode(type: string, code?: string) {
  switch (type) {
    case 'echo-reply':
    case 'echo-request': {
      switch (code) {
        case undefined:
          return 0;
        default:
          throw new Error('unknown icmp code');
      }
    }
    case 'destination-unreachable': {
      switch (code) {
        case 'network-unreachable':
          return 0;
        case 'host-unreachable':
          return 1;
        case 'protocol-unreachable':
          return 2;
        default:
          throw new Error('unknown icmp code');
      }
    }
    case 'time-exceeded':
      switch (code) {
        case 'ttl-exceeded':
          return 0;
        case 'fragment-reassembly-time-exceeded':
          return 1;
        default:
          throw new Error('unknown icmp code');
      }
    default:
      throw new Error('unknown icmp code');
  }
}
