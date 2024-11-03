import { describe, expect, test } from 'vitest';
import { formatMacAddress, parseMacAddress } from './ethernet.js';

describe('parseMacAddress', () => {
  test('should parse a valid MAC address string into a Uint8Array', () => {
    const macString = '01:23:45:67:89:ab';
    const result = parseMacAddress(macString);
    expect(result).toEqual(
      new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab])
    );
  });

  test('should handle MAC address with uppercase letters', () => {
    const macString = '01:23:45:67:89:AB';
    const result = parseMacAddress(macString);
    expect(result).toEqual(
      new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab])
    );
  });

  test('should throw an error for an invalid MAC address string', () => {
    const macString = '01:23:45:67:89:zz';
    expect(() => parseMacAddress(macString)).toThrow();
  });

  test('should throw an error for a MAC address string with an invalid length', () => {
    const macString = '01:23:45:67:89';
    expect(() => parseMacAddress(macString)).toThrow();
  });
});

describe('formatMacAddress', () => {
  test('should format a valid Uint8Array into a MAC address string', () => {
    const macArray = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
    const result = formatMacAddress(macArray);
    expect(result).toBe('01:23:45:67:89:ab');
  });

  test('should handle Uint8Array with leading zeros', () => {
    const macArray = new Uint8Array([0x00, 0x23, 0x45, 0x67, 0x89, 0xab]);
    const result = formatMacAddress(macArray);
    expect(result).toBe('00:23:45:67:89:ab');
  });

  test('should handle Uint8Array with all zeros', () => {
    const macArray = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = formatMacAddress(macArray);
    expect(result).toBe('00:00:00:00:00:00');
  });

  test('should throw an error for a Uint8Array with invalid length', () => {
    const macArray = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89]);
    expect(() => formatMacAddress(macArray)).toThrow();
  });

  test('should handle Uint8Array with mixed case letters', () => {
    const macArray = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
    const result = formatMacAddress(macArray);
    expect(result).toBe('01:23:45:67:89:ab');
  });

  test('should handle Uint8Array with maximum values', () => {
    const macArray = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const result = formatMacAddress(macArray);
    expect(result).toBe('ff:ff:ff:ff:ff:ff');
  });
});
