import { init } from '../platforms/node';
import Stack from '../stack.js';

beforeAll(async () => {
  await init();
});

test('ip address assigned', () => {
  // const stack = new Stack();
  // const loopbackInterface = stack.createLoopbackInterface({
  //   ipAddress: '127.0.0.1/8',
  // });
  // stack.net.createServer().listen({ host: '127.0.0.2', port: 80 });
  // const socket = stack.net.createConnection(80, '127.0.0.2', () => {});
  // console.log(socket.localAddress);
  // console.log(socket.localPort);
  // console.log(socket.remoteAddress);
  // console.log(socket.remotePort);
});
