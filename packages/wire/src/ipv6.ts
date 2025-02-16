/**
 * Parses an IPv6 address Uint8Array into a string.
 */
export function parseIPv6Address(data: Uint8Array) {
  return data
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')
    .match(/.{1,4}/g)!
    .join(':');
}

/**
 * Serialize an IPv6 address string into a Uint8Array.
 */
export function serializeIPv6Address(ip: string) {
  return new Uint8Array(
    ip.split(':').flatMap((n) => {
      const num = parseInt(n, 16);
      return [num >> 8, num & 0xff];
    })
  );
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
