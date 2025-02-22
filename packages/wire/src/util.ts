/**
 * Calculates the internet checksum of an array of bytes.
 *
 * @param data - The data to calculate the checksum for.
 * @param checksumOffset - The offset of the checksum field in the data.
 */
export function calculateChecksum(
  data: Uint8Array,
  checksumOffset?: number
): number {
  let sum = 0;

  // Sum all 16-bit words
  for (let i = 0; i < data.length; i += 2) {
    // Skip the checksum field if specified (16 bits)
    if (checksumOffset && i >= checksumOffset && i < checksumOffset + 2) {
      continue;
    }

    sum += (data[i]! << 8) | data[i + 1]!;
  }

  // Add the remaining byte if there is one
  while (sum >> 16) {
    sum = (sum & 0xffff) + (sum >> 16);
  }

  // Return the one's complement of the sum
  return ~sum & 0xffff;
}

/**
 * Parses a string into an unsigned integer.
 *
 * Uses direct character code comparison instead of `parseInt`
 * for better performance and stricter validation.
 *
 * `parseInt` is too permissive and allows invalid input like
 * whitespace, signs, and decimals.
 *
 * Throws if invalid characters are encountered.
 */
export function parseUint(str: string): number {
  if (str.length === 0) {
    throw new Error('empty string');
  }

  let value = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);

    if (char < 48 || char > 57) {
      // 0-9
      throw new Error('invalid character');
    }

    value = value * 10 + (char - 48);
  }

  return value;
}

/**
 * Parses a hex string into a number.
 *
 * Uses direct character code comparison instead of `parseInt`
 * for better performance and stricter validation.
 *
 * `parseInt` is too permissive and allows invalid hex characters
 * to slip through.
 *
 * Throws if invalid hex characters are encountered.
 */
export function parseHex(hex: string): number {
  let value = 0;
  for (let i = 0; i < hex.length; i++) {
    const char = hex.charCodeAt(i);
    let digit: number;

    if (char >= 48 && char <= 57) {
      // 0-9
      digit = char - 48;
    } else if (char >= 97 && char <= 102) {
      // a-f
      digit = char - 87;
    } else if (char >= 65 && char <= 70) {
      // A-F
      digit = char - 55;
    } else {
      throw new Error('invalid hex character');
    }

    value = (value << 4) | digit;
  }

  return value;
}
