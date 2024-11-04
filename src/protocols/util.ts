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
