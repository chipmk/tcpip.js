import { describe, expect, test } from 'vitest';
import { ptrNameToIP } from './util';

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
