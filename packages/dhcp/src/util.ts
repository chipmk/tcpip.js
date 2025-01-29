/**
 * Convert an IPv4 address string to a 32-bit number.
 */
export function ipv4ToNumber(ip: string): number {
  return (
    ip
      .split('.')
      .reduce((sum, octet) => (sum << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

/**
 * Convert a 32-bit number to an IPv4 address string.
 */
export function numberToIPv4(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}
