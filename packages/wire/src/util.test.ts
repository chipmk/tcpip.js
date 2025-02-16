import { describe, expect, test } from 'vitest';
import { calculateChecksum } from './util.js';

describe('calculateChecksum', () => {
  test('returns the correct checksum for an empty array', () => {
    const data = new Uint8Array([]);
    const checksum = calculateChecksum(data);
    expect(checksum).toBe(0xffff);
  });

  test('returns the correct checksum for an array with one byte', () => {
    const data = new Uint8Array([0x01]);
    const checksum = calculateChecksum(data);
    expect(checksum).toBe(0xfeff);
  });

  test('returns the correct checksum for an array with two bytes', () => {
    const data = new Uint8Array([0x01, 0x02]);
    const checksum = calculateChecksum(data);
    expect(checksum).toBe(0xfefd);
  });

  test('returns the correct checksum for an array with multiple bytes', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const checksum = calculateChecksum(data);
    expect(checksum).toBe(0xfbf9);
  });

  test('handles an array with an odd number of bytes', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const checksum = calculateChecksum(data);
    expect(checksum).toBe(0xfbfd);
  });
});
