import { serializeIPv4Address } from '@tcpip/wire';

/**
 * Converts an IPv4 address to a 32-bit number.
 */
export function ipv4ToNumber(ip: string): number {
  const bytes = serializeIPv4Address(ip);
  return (
    ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0
  );
}

/**
 * Converts a 32-bit number to an IPv4 address.
 */
export function numberToIPv4(num: number): string {
  if (isNaN(num) || num < 0 || num > 0xffffffff) {
    throw new Error('invalid ipv4 number');
  }

  const bytes = new Uint8Array([
    (num >> 24) & 0xff,
    (num >> 16) & 0xff,
    (num >> 8) & 0xff,
    num & 0xff,
  ]);

  return bytes.join('.');
}
