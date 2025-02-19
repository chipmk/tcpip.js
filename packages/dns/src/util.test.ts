import { describe, expect, test } from 'vitest';
import { ipToPtrName, ptrNameToIP } from './util';

describe('ipToPtrName', () => {
  test('should convert an IPv4 address to a PTR name', () => {
    const ptr = ipToPtrName('10.0.0.1');
    expect(ptr).toBe('1.0.0.10.in-addr.arpa');
  });

  test('should convert an IPv6 address to a PTR name', () => {
    const ptr = ipToPtrName('2001:db8::567:89ab');
    expect(ptr).toBe(
      'b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
    );
  });

  test('should handle compressed IPv6 addresses', () => {
    const ptr = ipToPtrName('::1');
    expect(ptr).toBe(
      '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa'
    );
  });
});

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
