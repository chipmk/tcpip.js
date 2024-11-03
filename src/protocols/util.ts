/**
 * Calculates the checksum of an array of bytes.
 */
export function calculateChecksum(data: Uint8Array) {
  let sum = 0;

  // Sum all 16-bit words.
  for (let i = 0; i < data.length; i += 2) {
    sum += (data[i]! << 8) | data[i + 1]!;
  }

  // Add the remaining byte if there is one.
  while (sum >> 16) {
    sum = (sum & 0xffff) + (sum >> 16);
  }

  // Return the one's complement of the sum.
  return ~sum & 0xffff;
}
