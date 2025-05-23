import { describe, expect, test, vi } from 'vitest';
import {
  generateMacAddress,
  parseMacAddress,
  serializeMacAddress,
} from './ethernet.js';

describe('serialize mac', () => {
  test('should parse a valid MAC address string into a Uint8Array', () => {
    const macString = '01:23:45:67:89:ab';
    const result = serializeMacAddress(macString);
    expect(result).toEqual(
      new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab])
    );
  });

  test('should handle MAC address with uppercase letters', () => {
    const macString = '01:23:45:67:89:AB';
    const result = serializeMacAddress(macString);
    expect(result).toEqual(
      new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab])
    );
  });

  test('should throw an error for an invalid MAC address string', () => {
    const macString = '01:23:45:67:89:zz';
    expect(() => serializeMacAddress(macString)).toThrow();
  });

  test('should throw an error for a MAC address string with an invalid length', () => {
    const macString = '01:23:45:67:89';
    expect(() => serializeMacAddress(macString)).toThrow();
  });
});

describe('parse mac', () => {
  test('should format a valid Uint8Array into a MAC address string', () => {
    const macArray = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
    const result = parseMacAddress(macArray);
    expect(result).toBe('01:23:45:67:89:ab');
  });

  test('should handle Uint8Array with leading zeros', () => {
    const macArray = new Uint8Array([0x00, 0x23, 0x45, 0x67, 0x89, 0xab]);
    const result = parseMacAddress(macArray);
    expect(result).toBe('00:23:45:67:89:ab');
  });

  test('should handle Uint8Array with all zeros', () => {
    const macArray = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = parseMacAddress(macArray);
    expect(result).toBe('00:00:00:00:00:00');
  });

  test('should throw an error for a Uint8Array with invalid length', () => {
    const macArray = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89]);
    expect(() => parseMacAddress(macArray)).toThrow();
  });

  test('should handle Uint8Array with mixed case letters', () => {
    const macArray = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
    const result = parseMacAddress(macArray);
    expect(result).toBe('01:23:45:67:89:ab');
  });

  test('should handle Uint8Array with maximum values', () => {
    const macArray = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const result = parseMacAddress(macArray);
    expect(result).toBe('ff:ff:ff:ff:ff:ff');
  });
});

describe('generate mac', () => {
  test('should generate a MAC address of length 6', () => {
    const mac = generateMacAddress();
    expect(mac).toHaveLength(6);
  });

  test('should set the locally administered bit and clear the unicast bit', () => {
    const mac = generateMacAddress();
    // Check that the locally administered bit (bit 1) is set to 1
    expect(mac[0]! & 0b00000010).toBe(0b00000010);
    // Check that the unicast bit (bit 0) is set to 0
    expect(mac[0]! & 0b00000001).toBe(0b00000000);
  });

  test('should generate different MAC addresses on subsequent calls', () => {
    const mac1 = generateMacAddress();
    const mac2 = generateMacAddress();
    expect(mac1).not.toEqual(mac2);
  });

  test('should use crypto.getRandomValues to generate the MAC address', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    generateMacAddress();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
