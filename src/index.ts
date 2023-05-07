import TcpipStack, { unwrap } from './tcpip-stack';
import wasm from './tcpip.wasm';
import Go from './wasm_exec';

(globalThis as any).TcpipStack = TcpipStack;
(globalThis as any).unwrap = unwrap;

const go = new Go();
WebAssembly.instantiateStreaming(fetch(wasm), go.importObject).then(
  (result) => {
    go.run(result.instance);

    const stack = new TcpipStack({
      ipNetwork: '10.1.0.1/24',
    });

    stack.on('outbound-ethernet-frame', (frame) => console.log(frame));

    stack.injectEthernetFrame(
      // ARP request
      new Uint8Array([
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xb2, 0x69, 0xb3, 0x94, 0xd0, 0x8c,
        0x08, 0x06, 0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01, 0xb2, 0x69,
        0xb3, 0x94, 0xd0, 0x8c, 0x0a, 0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x0a, 0x01, 0x00, 0x01,
      ])
    );
  }
);
