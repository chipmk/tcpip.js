import type { DatagramTransport, StreamTransport } from '@tcpip/transport';
import { expectTypeOf, test } from 'vitest';
import type { TcpTransport, UdpTransport } from './types.js';

test('TcpTransport satisfies StreamTransport', () => {
  expectTypeOf<TcpTransport>().toExtend<StreamTransport>();
});

test('UdpTransport satisfies DatagramTransport', () => {
  expectTypeOf<UdpTransport>().toExtend<DatagramTransport>();
});
