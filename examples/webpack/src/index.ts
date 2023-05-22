import { polyfill } from '@tcpip/polyfill';
import { createConnection, createServer } from 'net';
import { Stack, initStreaming } from 'tcpip';
import tcpipWasm from 'tcpip/tcpip.wasm';

initStreaming(fetch(tcpipWasm)).then(() => {
  const stack = new Stack();
  polyfill(stack);

  stack.createLoopbackInterface({
    ipAddress: '127.0.0.1/8',
  });

  const server = createServer();
  server.on('connection', (socket) => {
    console.log('New connection', socket);
    socket.write('Hello client!');
    socket.on('data', async (data) => {
      console.log('Server received:', data.toString());
    });
    socket.on('end', () => {
      console.log('Socket ended');
    });
    socket.on('close', () => {
      console.log('Socket closed');
    });
  });
  server.on('error', (err) => console.log('Server', err));
  server.on('end', () => console.log('end'));
  server.on('close', () => console.log('close'));
  server.listen({ port: 80 });

  const socket = createConnection({
    host: '127.0.0.1',
    port: 80,
    timeout: 1500,
  });

  socket.on('connect', () => console.log('connect'));
  socket.on('error', (err) => console.log('Socket', err));
  socket.on('end', () => console.log('end'));
  socket.on('close', (hadError) => console.log('close', hadError));
  socket.on('timeout', () => console.log('timed out'));
  socket.on('data', async (data) => {
    console.log('Client received:', data.toString());
    socket.write('Hello server!');
  });
});
