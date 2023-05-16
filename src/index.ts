import LoopbackInterface from './interfaces/loopback-interface';
import TapInterface from './interfaces/tap-interface';
import TunInterface from './interfaces/tun-interface';
import Server from './server';
import Socket from './socket';
import TcpipStack, { unwrap } from './tcpip-stack';
import wasm from './tcpip.wasm';
import Go from './wasm_exec';

const tcpipNamespace = {
  TcpipStack,
  LoopbackInterface,
  TapInterface,
  TunInterface,
  Socket,
  Server,
  unwrap,
};

// TODO: find a way to pass this directly to WASM via import object
(globalThis as any)['@tcpip/stack'] = tcpipNamespace;

const go = new Go();
WebAssembly.instantiateStreaming(fetch(wasm), go.importObject).then(
  (result) => {
    go.run(result.instance);

    const stack = new TcpipStack({});

    const loopbackInterface = new LoopbackInterface({
      stack,
      ipNetwork: '127.0.0.1/8',
    });

    const tapInterface = new TapInterface({
      stack,
      ipNetwork: '10.1.0.1/24',
      macAddress: '0a:0a:0b:0b:0c:0c',
    });

    const tunInterface = new TunInterface({
      stack,
      ipNetwork: '10.2.0.1/24',
    });

    const webSocket = new WebSocket('ws://localhost:8080/tun-proxy');
    webSocket.binaryType = 'arraybuffer';

    webSocket.addEventListener('open', () => {
      console.log('Connected to web socket server');

      tunInterface.on('packet', (packet) => {
        webSocket.send(packet);
      });
    });

    webSocket.addEventListener('message', (e: MessageEvent<ArrayBuffer>) => {
      const packet = new Uint8Array(e.data);
      tunInterface.injectPacket(packet);
    });

    webSocket.addEventListener('error', (e) => {
      console.log('Error', e);
    });

    webSocket.addEventListener('close', () => {
      console.log('Closed');
    });

    tapInterface.on('frame', (frame) =>
      console.log({
        type: 'frame',
        hex: Array.from(frame)
          .map((x) => x.toString(16).padStart(2, '0'))
          .join(' '),
      })
    );

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
      socket.on('end', () => {
        console.log('Socket ended');
      });
      socket.on('close', () => {
        console.log('Socket closed');
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

    socket.connect({ host: '127.0.0.1', port: 80 });
  }
);
