import { getPort } from '../test/util';
import { init } from './platforms/node';
import Socket from './socket';
import Stack from './stack';

let stack: Stack;

beforeAll(async () => {
  await init();
  stack = new Stack();

  stack.createLoopbackInterface({
    ipAddress: '127.0.0.1/8',
  });
});

test('listens', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });

  await new Promise<void>((r) => server.once('listening', r));
});

test('closes', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });

  await new Promise<void>((r) => server.once('listening', r));

  server.close();

  await new Promise<void>((r) => server.once('close', r));
});

test('close returns error if not listening', async () => {
  const server = stack.net.createServer();

  const asyncTest = async () =>
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );

  await expect(asyncTest).rejects.toThrowError('Server is not running.');
});

test('listening prop', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  expect(server.listening).toBe(false);

  server.listen({ port });

  // We expect the server to only start listening
  // after the call stack
  expect(server.listening).toBe(false);

  await new Promise<void>((r) => server.once('listening', r));

  expect(server.listening).toBe(true);
});

test('getConnections() count when opening/closing connections', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });
  await new Promise<void>((r) => server.once('listening', r));

  const count1 = await new Promise((resolve, reject) =>
    server.getConnections((err, count) => (err ? reject(err) : resolve(count)))
  );

  expect(count1).toBe(0);

  const socket = stack.net.createConnection(port, '127.0.0.1');

  const serverSocket = await new Promise<Socket>((r) =>
    server.once('connection', r)
  );

  const count2 = await new Promise((resolve, reject) =>
    server.getConnections((err, count) => (err ? reject(err) : resolve(count)))
  );

  serverSocket.on('data', (data) => console.log(data));

  expect(count2).toBe(1);

  socket.end('test');
  // socket.end();

  await new Promise<void>((r) => serverSocket.once('close', r));

  const count3 = await new Promise((resolve, reject) =>
    server.getConnections((err, count) => (err ? reject(err) : resolve(count)))
  );

  expect(count3).toBe(0);
});
