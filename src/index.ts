import TapInterface from './interfaces/tap-interface';
import Server from './server';
import Socket from './socket';
import TcpipStack, { unwrap } from './tcpip-stack';
import wasm from './tcpip.wasm';
import Go from './wasm_exec';

(globalThis as any).TcpipStack = TcpipStack;
(globalThis as any).TapInterface = TapInterface;
(globalThis as any).Socket = Socket;
(globalThis as any).Server = Server;
(globalThis as any).unwrap = unwrap;

const go = new Go();
WebAssembly.instantiateStreaming(fetch(wasm), go.importObject).then(
  (result) => {
    go.run(result.instance);

    const stack = new TcpipStack({});

    const tapInterface = new TapInterface({
      stack,
      ipNetwork: '10.1.0.1/24',
    });

    tapInterface.on('frame', (frame) => console.log(frame));

    tapInterface.injectFrame(
      // ARP request
      new Uint8Array([
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xb2, 0x69, 0xb3, 0x94, 0xd0, 0x8c,
        0x08, 0x06, 0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01, 0xb2, 0x69,
        0xb3, 0x94, 0xd0, 0x8c, 0x0a, 0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x0a, 0x01, 0x00, 0x01,
      ])
    );

    const server = new Server({ stack });
    server.on('connection', (socket) => {
      console.log('New connection', socket);
      socket.write('Hello client!');
      socket.on('data', async (data) => {
        console.log('Server received:', data.toString());
      });
    });
    server.on('error', (err) => console.log('Server', err));
    server.on('end', () => console.log('end'));
    server.on('close', (hadError) => console.log('close', hadError));
    server.listen({ port: 80 });

    const socket = new Socket({ stack });

    socket.on('connect', () => console.log('connect'));
    socket.on('error', (err) => console.log('Socket', err));
    socket.on('end', () => console.log('end'));
    socket.on('close', (hadError) => console.log('close', hadError));
    socket.on('data', async (data) => {
      console.log('Client received:', data.toString());
      socket.write('Hello server!');
    });

    socket.connect({ host: '10.1.0.1', port: 80 });
  }
);
