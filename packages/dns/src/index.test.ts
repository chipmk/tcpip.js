import { createStack } from 'tcpip';
import { describe, expect, test } from 'vitest';
import { createDns, ptrNameToIP } from './index.js';

describe('createDns', () => {
  test('client and server can communicate', async () => {
    const stack = await createStack();
    const { lookup, serve } = await createDns(stack);

    await serve({
      request: async ({ name, type }) => {
        if (name !== 'example.com' || type !== 'A') {
          throw new Error(`unexpected test query: ${name} ${type}`);
        }

        return {
          type,
          ip: '10.0.0.1',
          ttl: 300,
        };
      },
    });

    const ip = await lookup('example.com');

    expect(ip).toBe('10.0.0.1');
  });

  test('reverse A lookup', async () => {
    const stack = await createStack();
    const { reverse, serve } = await createDns(stack);

    await serve({
      request: async ({ name, type }) => {
        const { type: ptrType, ip } = ptrNameToIP(name);

        if (type !== 'PTR' || ptrType !== 'ipv4' || ip !== '10.0.0.1') {
          throw new Error(`unexpected test query: ${name} ${type}`);
        }

        return {
          type,
          ptr: 'example.com',
          ttl: 300,
        };
      },
    });

    const name = await reverse('10.0.0.1');

    expect(name).toBe('example.com');
  });

  test('reverse AAAA lookup', async () => {
    const stack = await createStack();
    const { reverse, serve } = await createDns(stack);

    await serve({
      request: async ({ name, type }) => {
        const { type: ptrType, ip } = ptrNameToIP(name);

        if (type !== 'PTR' || ptrType !== 'ipv6' || ip !== '2001:db8::1') {
          throw new Error(`unexpected test query: ${name} ${type}`);
        }

        return {
          type,
          ptr: 'example.com',
          ttl: 300,
        };
      },
    });

    const name = await reverse('2001:db8::1');

    expect(name).toBe('example.com');
  });
});
