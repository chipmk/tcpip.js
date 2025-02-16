import { describe, expect, test } from 'vitest';
import {
  compressIPv6,
  expandIPv6,
  parseIPv6Address,
  serializeIPv6Address,
} from './ipv6.js';

describe('parseIPv6Address', () => {
  test('parses a binary IPv6 address to string', () => {
    const data = new Uint8Array([
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x01,
    ]);
    const parsed = parseIPv6Address(data);
    expect(parsed).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });

  test('parses all zeros binary IPv6 address', () => {
    const data = new Uint8Array(16).fill(0);
    const parsed = parseIPv6Address(data);
    expect(parsed).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
  });

  test('parses all ones binary IPv6 address', () => {
    const data = new Uint8Array(16).fill(255);
    const parsed = parseIPv6Address(data);
    expect(parsed).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
  });
});

describe('serializeIPv6Address', () => {
  test('serializes an IPv6 address string to binary', () => {
    const ip = '2001:0db8:0000:0000:0000:0000:0000:0001';
    const serialized = serializeIPv6Address(ip);
    expect(serialized).toEqual(
      new Uint8Array([
        0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x01,
      ])
    );
  });

  test('serializes all zeros IPv6 address', () => {
    const ip = '0000:0000:0000:0000:0000:0000:0000:0000';
    const serialized = serializeIPv6Address(ip);
    expect(serialized).toEqual(new Uint8Array(16).fill(0));
  });

  test('serializes all ones IPv6 address', () => {
    const ip = 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff';
    const serialized = serializeIPv6Address(ip);
    expect(serialized).toEqual(new Uint8Array(16).fill(255));
  });
});

describe('compressIPv6', () => {
  test('compresses an IPv6 address with leading zeros', () => {
    const ip = '0000:0000:0000:0000:0000:0000:0000:0001';
    const compressed = compressIPv6(ip);
    expect(compressed).toBe('::1');
  });

  test('compresses an IPv6 address with trailing zeros', () => {
    const ip = '2001:0000:0000:0000:0000:0000:0000:0000';
    const compressed = compressIPv6(ip);
    expect(compressed).toBe('2001::');
  });

  test('compresses an IPv6 address with consecutive zeros', () => {
    const ip = '2001:0db8:0000:0000:0000:0000:0000:0001';
    const compressed = compressIPv6(ip);
    expect(compressed).toBe('2001:db8::1');
  });

  test('compresses an IPv6 address with no zeros', () => {
    const ip = '2001:db8:1234:5678:9abc:def0:1234:5678';
    const compressed = compressIPv6(ip);
    expect(compressed).toBe('2001:db8:1234:5678:9abc:def0:1234:5678');
  });

  test('compresses an IPv6 address with a single zero block', () => {
    const ip = '2001:db8:0:1:0:0:0:1';
    const compressed = compressIPv6(ip);
    expect(compressed).toBe('2001:db8:0:1::1');
  });

  test('compresses an IPv6 address with multiple zero blocks', () => {
    const ip = '2001:0:0:1:0:0:0:1';
    const compressed = compressIPv6(ip);
    expect(compressed).toBe('2001:0:0:1::1');
  });
});

describe('expandIPv6', () => {
  test('expands an IPv6 address with leading zeros', () => {
    const ip = '::1';
    const expanded = expandIPv6(ip);
    expect(expanded).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
  });

  test('expands an IPv6 address with trailing zeros', () => {
    const ip = '2001::';
    const expanded = expandIPv6(ip);
    expect(expanded).toBe('2001:0000:0000:0000:0000:0000:0000:0000');
  });

  test('expands an IPv6 address with consecutive zeros', () => {
    const ip = '2001:db8::1';
    const expanded = expandIPv6(ip);
    expect(expanded).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });

  test('expands an IPv6 address with partial zeros', () => {
    const ip = '2001:db8:1234:5678:9abc:def0:1234:5678';
    const expanded = expandIPv6(ip);
    expect(expanded).toBe('2001:0db8:1234:5678:9abc:def0:1234:5678');
  });

  test('expands an IPv6 address with a single zero block', () => {
    const ip = '2001:db8:0:1::1';
    const expanded = expandIPv6(ip);
    expect(expanded).toBe('2001:0db8:0000:0001:0000:0000:0000:0001');
  });

  test('expands an IPv6 address with multiple zero blocks', () => {
    const ip = '2001:0:0:1::1';
    const expanded = expandIPv6(ip);
    expect(expanded).toBe('2001:0000:0000:0001:0000:0000:0000:0001');
  });
});
