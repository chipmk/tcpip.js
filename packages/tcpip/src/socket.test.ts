import { getPort } from '../test/util';
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

test('local address and port exist after connect', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });
  const socket = stack.net.createConnection(port, '127.0.0.1');

  expect(socket.localAddress).toBeUndefined();
  expect(socket.localPort).toBeUndefined();

  await new Promise((r) => socket.once('connect', r));

  expect(socket.localAddress).toBe('127.0.0.1');
  expect(socket.localPort).toEqual(expect.any(Number));
});

test('remote address and port exist after connect', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });
  const socket = stack.net.createConnection(port, '127.0.0.1');

  expect(socket.remoteAddress).toBeUndefined();
  expect(socket.remotePort).toBeUndefined();

  await new Promise((r) => socket.once('connect', r));

  expect(socket.remoteAddress).toBe('127.0.0.1');
  expect(socket.remotePort).toBe(port);
});

test('setKeepAlive returns this', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });
  const socket = stack.net.createConnection(port, '127.0.0.1');

  const returnedSocket = socket.setKeepAlive(false);

  expect(returnedSocket).toBe(socket);

  socket.setKeepAlive(false);
  await new Promise((r) => socket.once('connect', r));
  console.log('connected');

  server.close();
});

test('setKeepAlive callable before connect', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });
  const socket = stack.net.createConnection(port, '127.0.0.1');

  socket.setKeepAlive(false);
  // socket.setKeepAlive(true);

  await new Promise((r) => setTimeout(r, 1000));
  socket.setKeepAlive(false);

  server.close();
  // await new Promise((r) => socket.once('connect', r));
});

test('setNoDelay returns this', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });
  const socket = stack.net.createConnection(port, '127.0.0.1');

  const returnedSocket = socket.setNoDelay(true);
  expect(returnedSocket).toBe(socket);
});

test('setNoDelay callable before connect', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });
  const socket = stack.net.createConnection(port, '127.0.0.1');

  socket.setNoDelay(true);

  await new Promise((r) => socket.once('connect', r));
});
