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

test('server listens', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });

  await new Promise<void>((r) => server.once('listening', r));
});

test('server closes', async () => {
  const port = getPort();
  const server = stack.net.createServer();

  server.listen({ port });

  await new Promise<void>((r) => server.once('listening', r));

  server.close();

  await new Promise<void>((r) => server.once('close', r));
});

test('server close returns error if not listening', async () => {
  const server = stack.net.createServer();

  const asyncTest = async () =>
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );

  await expect(asyncTest).rejects.toThrowError('Server is not running.');
});

test('server listening prop', async () => {
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
