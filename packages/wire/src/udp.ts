import { serializeIPv4PseudoHeader, type IPv4PseudoHeader } from './ipv4.js';
import { calculateChecksum } from './util.js';

export type UdpDatagram = {
  sourcePort: number;
  destinationPort: number;
  payload: Uint8Array;
};

export const UDP_HEADER_LENGTH = 8;

/**
 * Parses a UDP datagram into an object.
 *
 * Optionally verifies the UDP checksum if an IP pseudo-header is provided
 * (required for UDP checksum verification).
 */
export function parseUdpDatagram(
  data: Uint8Array,
  pseudoHeader?: Uint8Array
): UdpDatagram {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const header = data.subarray(0, UDP_HEADER_LENGTH);
  const checksum = dataView.getUint16(6);

  // If the IP packet is provided, verify the UDP checksum.
  if (pseudoHeader) {
    // Create buffer for checksum verification (pseudo-header + UDP header + payload)
    const checksumBuffer = new Uint8Array(pseudoHeader.length + data.length);
    checksumBuffer.set(pseudoHeader);
    checksumBuffer.set(data, pseudoHeader.length);

    if (
      calculateChecksum(checksumBuffer, pseudoHeader.length + 6) !== checksum
    ) {
      throw new Error('invalid udp checksum');
    }
  } else {
    console.warn(
      'no pseudo header provided: udp checksum verification skipped'
    );
  }

  const length = dataView.getUint16(4);
  const payload = data.subarray(8);

  if (length !== UDP_HEADER_LENGTH + payload.length) {
    throw new Error('invalid udp length');
  }

  const sourcePort = dataView.getUint16(0);
  const destinationPort = dataView.getUint16(2);

  return {
    sourcePort,
    destinationPort,
    payload,
  };
}

/**
 * Serializes a UDP datagram object into a Uint8Array.
 *
 * Optionally calculates the UDP checksum if an IP pseudo-header is provided
 * (required for UDP checksum calculation).
 * If no IP pseudo-header is provided, the checksum field will be set to 0.
 */
export function serializeUdpDatagram(
  datagram: UdpDatagram,
  pseudoHeader?: IPv4PseudoHeader
): Uint8Array {
  const buffer = new Uint8Array(UDP_HEADER_LENGTH + datagram.payload.length);
  const dataView = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  dataView.setUint16(0, datagram.sourcePort);
  dataView.setUint16(2, datagram.destinationPort);
  dataView.setUint16(4, UDP_HEADER_LENGTH + datagram.payload.length);
  dataView.setUint16(6, 0); // checksum
  buffer.set(datagram.payload, 8);

  if (pseudoHeader) {
    const pseudoHeaderBuffer = serializeIPv4PseudoHeader(pseudoHeader);

    // Create buffer for checksum verification (pseudo-header + UDP header + payload)
    const checksumBuffer = new Uint8Array(
      pseudoHeaderBuffer.length + buffer.length
    );
    checksumBuffer.set(pseudoHeaderBuffer);
    checksumBuffer.set(buffer, pseudoHeaderBuffer.length);

    const checksum = calculateChecksum(
      checksumBuffer,
      pseudoHeaderBuffer.length + 6
    );

    dataView.setUint16(6, checksum);
  } else {
    console.warn(
      'no pseudo header provided: udp checksum calculation skipped (set to 0)'
    );
  }

  return buffer;
}
