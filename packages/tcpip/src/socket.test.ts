import { init } from './platforms/node';
import Stack from './stack';

let stack: Stack;

beforeAll(async () => {
  await init();
  stack = new Stack();

  stack.createLoopbackInterface({
    ipAddress: '127.0.0.1/8',
  });
});

test('local address and port after connect', async () => {
  stack.net.createServer().listen({ port: 80 });
  const socket = stack.net.createConnection(80, '127.0.0.1');

  expect(socket.localAddress).toBeUndefined();
  expect(socket.localPort).toBeUndefined();

  await new Promise((r) => socket.once('connect', r));

  expect(socket.localAddress).toBe('127.0.0.1');
  expect(socket.localPort).toEqual(expect.any(Number));
});

test('remote address and port after connect', async () => {
  stack.net.createServer().listen({ port: 80 });
  const socket = stack.net.createConnection(80, '127.0.0.1');

  expect(socket.remoteAddress).toBeUndefined();
  expect(socket.remotePort).toBeUndefined();

  await new Promise((r) => socket.once('connect', r));

  expect(socket.remoteAddress).toBe('127.0.0.1');
  expect(socket.remotePort).toBe(80);
});
