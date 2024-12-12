import { expect, test } from 'vitest';
import {
  parseIPv4Address,
  generateNetmask,
  serializeIPv4Address,
  serializeIPv4Cidr,
} from './ipv4.js';

test('parses an IPv4 address string into a Uint8Array', () => {
  expect(serializeIPv4Address('192.168.1.1')).toEqual(
    Uint8Array.from([192, 168, 1, 1])
  );
  expect(serializeIPv4Address('10.0.0.1')).toEqual(
    Uint8Array.from([10, 0, 0, 1])
  );
  expect(serializeIPv4Address('255.255.255.255')).toEqual(
    Uint8Array.from([255, 255, 255, 255])
  );
  expect(serializeIPv4Address('0.0.0.0')).toEqual(
    Uint8Array.from([0, 0, 0, 0])
  );
});

test('parses a cidr notation string', () => {
  expect(serializeIPv4Cidr('192.168.1.1/24')).toEqual({
    ipAddress: Uint8Array.from([192, 168, 1, 1]),
    netmask: Uint8Array.from([255, 255, 255, 0]),
  });
});

test('generates a netmask from a mask size', () => {
  expect(generateNetmask(24)).toEqual(Uint8Array.from([255, 255, 255, 0]));
  expect(generateNetmask(16)).toEqual(Uint8Array.from([255, 255, 0, 0]));
  expect(generateNetmask(8)).toEqual(Uint8Array.from([255, 0, 0, 0]));
});

test('throws an error for invalid mask sizes', () => {
  expect(() => generateNetmask(33)).toThrow();
});

test('formats a Uint8Array into an IPv4 address string', () => {
  expect(parseIPv4Address(Uint8Array.from([192, 168, 1, 1]))).toBe(
    '192.168.1.1'
  );
  expect(parseIPv4Address(Uint8Array.from([10, 0, 0, 1]))).toBe('10.0.0.1');
  expect(parseIPv4Address(Uint8Array.from([255, 255, 255, 255]))).toBe(
    '255.255.255.255'
  );
  expect(parseIPv4Address(Uint8Array.from([0, 0, 0, 0]))).toBe('0.0.0.0');
});
