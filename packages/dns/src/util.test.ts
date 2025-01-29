import { describe, expect, test } from 'vitest';
import { compressIPv6, expandIPv6, ptrNameToIP } from './util';

describe('ptrNameToIP', () => {
  test('should convert PTR name to an IPv4 address', () => {
    const result = ptrNameToIP('1.0.0.10.in-addr.arpa');
    expect(result.type).toBe('ipv4');
    expect(result.ip).toBe('10.0.0.1');
  });

  test('should convert PTR name to an IPv6 address', () => {
    const result = ptrNameToIP(
      'b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
    );
    expect(result.type).toBe('ipv6');
    expect(result.ip).toBe('2001:db8::567:89ab');
  });

  test('should throw an error for invalid top level domain', () => {
    expect(() => ptrNameToIP('1.0.0.10.in-addr.com')).toThrow(
      'invalid PTR name: 1.0.0.10.in-addr.com'
    );
  });

  test('should throw an error for invalid second level domain', () => {
    expect(() => ptrNameToIP('1.0.0.10.invalid.arpa')).toThrow(
      'invalid PTR name: 1.0.0.10.invalid.arpa'
    );
  });

  test('should handle empty input', () => {
    expect(() => ptrNameToIP('')).toThrow('invalid PTR name: ');
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
