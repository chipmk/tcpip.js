import { compressIPv6, expandIPv6, serializeIPv6Address } from '@tcpip/wire';

export type PtrIPv4 = {
  type: 'ipv4';
  ip: string;
};

export type PtrIPv6 = {
  type: 'ipv6';
  ip: string;
};

export type PtrIP = PtrIPv4 | PtrIPv6;

/**
 * Converts an IPv4 or IPv6 address to a reversed PTR name.
 *
 * @example
 * // Convert IPv4 address to PTR name
 * ipToPtrName('10.0.0.1');
 * // '1.0.0.10.in-addr.arpa'
 *
 * @example
 * // Convert IPv6 address to PTR name
 * ipToPtrName('2001:db8::567:89ab');
 * // 'b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
 */
export function ipToPtrName(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts.reverse().join('.')}.in-addr.arpa`;
  }

  const ipv6 = expandIPv6(ip);
  const ipv6Bytes = serializeIPv6Address(ipv6);

  const partsV6 = Array.from(ipv6Bytes).flatMap((byte) =>
    [byte >> 4, byte & 0xf].map((n) => n.toString(16))
  );

  return `${partsV6.reverse().join('.')}.ip6.arpa`;
}

/**
 * Converts a reversed PTR name to an IPv4 or IPv6 address.
 *
 * @example
 * // Convert PTR name to an IPv4 address
 * ptrNameToIP('1.0.0.10.in-addr.arpa');
 * // { type: 'ipv4', ip: '10.0.0.1' }
 *
 * @example
 * // Convert PTR name to an IPv6 address
 * ptrNameToIP(
 *  'b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
 * );
 * // { type: 'ipv6', ip: '2001:db8::567:89ab' }
 */
export function ptrNameToIP(name: string): PtrIP {
  const [first, second, ...parts] = name
    .split('.')
    .reverse()
    .filter((part) => !!part);

  // Top level domain must be 'arpa'
  if (first !== 'arpa') {
    throw new Error(`invalid PTR name: ${name}`);
  }

  // Second level domain must be 'in-addr' or 'ip6'
  switch (second) {
    case 'in-addr':
      return {
        type: 'ipv4',
        ip: parts.join('.'),
      };

    case 'ip6':
      return {
        type: 'ipv6',
        ip: compressIPv6(
          parts
            .join('')
            .replace(/(.{4})/g, '$1:')
            .replace(/:$/, '')
        ),
      };

    default:
      throw new Error(`invalid PTR name: ${name}`);
  }
}
