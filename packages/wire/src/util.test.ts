import { describe, expect, test } from 'vitest';
import { calculateChecksum, parseHex, parseUint } from './util.js';

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

describe('parseUint', () => {
  test('should parse valid integers correctly', () => {
    expect(parseUint('0')).toBe(0);
    expect(parseUint('1')).toBe(1);
    expect(parseUint('123')).toBe(123);
    expect(parseUint('999')).toBe(999);
  });

  test('should throw error for empty string', () => {
    expect(() => parseUint('')).toThrow('empty string');
  });

  test('should throw error for invalid characters', () => {
    expect(() => parseUint('12a')).toThrow('invalid character');
    expect(() => parseUint('1.2')).toThrow('invalid character');
    expect(() => parseUint('-123')).toThrow('invalid character');
    expect(() => parseUint(' 123')).toThrow('invalid character');
    expect(() => parseUint('123 ')).toThrow('invalid character');
  });
});

describe('parseHex', () => {
  test('should parse lowercase hex digits correctly', () => {
    expect(parseHex('ab')).toBe(171);
    expect(parseHex('ff')).toBe(255);
    expect(parseHex('dead')).toBe(57005);
  });

  test('should parse uppercase hex digits correctly', () => {
    expect(parseHex('AB')).toBe(171);
    expect(parseHex('FF')).toBe(255);
    expect(parseHex('DEAD')).toBe(57005);
  });

  test('should parse mixed case hex digits correctly', () => {
    expect(parseHex('aB')).toBe(171);
    expect(parseHex('DeAd')).toBe(57005);
  });

  test('should parse numeric hex digits correctly', () => {
    expect(parseHex('12')).toBe(18);
    expect(parseHex('90')).toBe(144);
  });

  test('should throw error for invalid hex characters', () => {
    expect(() => parseHex('g')).toThrow('invalid hex character');
    expect(() => parseHex('xyz')).toThrow('invalid hex character');
    expect(() => parseHex('12.34')).toThrow('invalid hex character');
    expect(() => parseHex('')).not.toThrow();
  });
});
