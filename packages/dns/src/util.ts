/**
 * Chunk a string into parts of a given size.
 */
export function chunk(value: string, size: number) {
  const parts = [];
  for (let i = 0; i < value.length; i += size) {
    parts.push(value.slice(i, i + size));
  }
  return parts;
}

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

/**
 * Compresses an IPv6 address by removing leading zeros.
 */
export function compressIPv6(ip: string) {
  // Split into groups and normalize to lowercase
  const groups = ip.toLowerCase().split(':');

  // Remove leading zeros from each group
  const normalizedGroups = groups.map(
    (group) => group.replace(/^0+(?=\w)/, '') // Remove leading zeros, keep single 0
  );

  // Find longest sequence of empty groups
  let longestZeroStart = -1;
  let longestZeroLength = 0;
  let currentZeroStart = -1;
  let currentZeroLength = 0;

  for (let i = 0; i < normalizedGroups.length; i++) {
    if (normalizedGroups[i] === '0' || normalizedGroups[i] === '') {
      if (currentZeroStart === -1) currentZeroStart = i;
      currentZeroLength++;

      if (currentZeroLength > longestZeroLength) {
        longestZeroStart = currentZeroStart;
        longestZeroLength = currentZeroLength;
      }
    } else {
      currentZeroStart = -1;
      currentZeroLength = 0;
    }
  }

  // Replace longest zero sequence with :: if it's at least 2 groups long
  if (longestZeroLength >= 2) {
    // Clear out the zero sequence
    normalizedGroups.splice(longestZeroStart, longestZeroLength);

    // Insert empty string for :: compression
    if (longestZeroStart === 0) {
      // Leading zeros - ensure we have two colons at start
      normalizedGroups.unshift('', '');
    } else if (longestZeroStart === normalizedGroups.length) {
      // Trailing zeros - ensure we have two colons at end
      normalizedGroups.push('', '');
    } else {
      // Middle zeros - add empty string for ::
      normalizedGroups.splice(longestZeroStart, 0, '');
    }
  }

  return normalizedGroups.join(':');
}

/**
 * Expands an IPv6 address by adding leading zeros.
 */
export function expandIPv6(ip: string) {
  // Handle empty string edge case
  if (!ip) {
    throw new Error(`invalid IPv6 address: ${ip}`);
  }

  // Split on :: to handle compressed zeros
  const doubleColonSplit = ip.split('::').map((part) => part.split(':'));

  if (doubleColonSplit.length > 2) {
    throw new Error(`invalid IPv6 address: ${ip}`);
  }

  const [left, right] = doubleColonSplit;

  if (!left) {
    throw new Error(`invalid IPv6 address: ${ip}`);
  }

  // If no :: compression, just pad each group
  if (!right) {
    return left.map((group) => group.padStart(4, '0')).join(':');
  }

  // Calculate how many zero groups we need
  const totalGroups = 8;
  const missingGroups = totalGroups - (left.length + right.length);
  const zeros = Array(missingGroups).fill('0000');

  // Combine all parts and pad each group
  return [...left, ...zeros, ...right]
    .map((group) => group.padStart(4, '0'))
    .join(':');
}
