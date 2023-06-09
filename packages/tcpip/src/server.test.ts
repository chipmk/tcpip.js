import { init } from './platforms/node';
import Stack from './stack';

let stack: Stack;
let ports = 8000;

function getPort() {
  return ports++;
}

beforeAll(async () => {
  await init();
  stack = new Stack();

  stack.createLoopbackInterface({
    ipAddress: '127.0.0.1/8',
  });
});

test('server listens', async () => {
  const server = stack.net.createServer();
  server.listen({ port: getPort() });

  await new Promise<void>((r) => server.once('listening', r));
});

test('server closes', async () => {
  const server = stack.net.createServer();
  server.listen({ port: getPort() });

  await new Promise<void>((r) => server.once('listening', r));

  server.close();

  await new Promise<void>((r) => server.once('close', r));
});

test('server close returns error if not opened', async () => {
  const server = stack.net.createServer();

  const asyncTest = async () =>
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );

  await expect(asyncTest).rejects.toThrowError('Server is not running.');
});

test('server listening prop', async () => {
  const server = stack.net.createServer();

  expect(server.listening).toBe(false);

  server.listen({ port: getPort() });

  // We expect the server to only start listening
  // after the call stack
  expect(server.listening).toBe(false);

  await new Promise<void>((r) => server.once('listening', r));

  expect(server.listening).toBe(true);
});
