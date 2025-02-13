import { describe, expect, test, vi } from 'vitest';
import { generateMacAddress } from './util';

describe('generateMacAddress', () => {
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
