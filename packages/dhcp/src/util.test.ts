import { describe, expect, test } from 'vitest';
import { ipv4ToNumber, numberToIPv4 } from './util.js';

describe('ipv4ToNumber', () => {
  test('should convert valid IPv4 addresses to numbers', () => {
    expect(ipv4ToNumber('0.0.0.0')).toBe(0x000000);
    expect(ipv4ToNumber('192.168.1.1')).toBe(0xc0a80101);
    expect(ipv4ToNumber('255.255.255.255')).toBe(0xffffffff);
    expect(ipv4ToNumber('10.0.0.1')).toBe(0x0a000001);
  });

  test('should handle single digit octets', () => {
    expect(ipv4ToNumber('1.2.3.4')).toBe(16909060);
  });

  test('throws error for invalid IPv4 addresses', () => {
    expect(() => ipv4ToNumber('256.1.2.3')).toThrow();
    expect(() => ipv4ToNumber('1.2.3.256')).toThrow();
    expect(() => ipv4ToNumber('1.2.3')).toThrow();
    expect(() => ipv4ToNumber('1.2.3.4.5')).toThrow();
    expect(() => ipv4ToNumber('invalid')).toThrow();
  });
});

describe('numberToIPv4', () => {
  test('should convert numbers to valid IPv4 addresses', () => {
    expect(numberToIPv4(0)).toBe('0.0.0.0');
    expect(numberToIPv4(3232235777)).toBe('192.168.1.1');
    expect(numberToIPv4(4294967295)).toBe('255.255.255.255');
    expect(numberToIPv4(167772161)).toBe('10.0.0.1');
  });

  test('should handle edge cases', () => {
    expect(numberToIPv4(16909060)).toBe('1.2.3.4');
    expect(numberToIPv4(0xfffffffe)).toBe('255.255.255.254');
  });

  test('should throw error for invalid numbers', () => {
    expect(() => numberToIPv4(-1)).toThrow();
    expect(() => numberToIPv4(4294967296)).toThrow();
    expect(() => numberToIPv4(NaN)).toThrow();
  });
});
