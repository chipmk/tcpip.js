import type Module from 'module';
import Go from './go/wasm_exec.js';
import LoopbackInterface from './interfaces/loopback-interface.js';
import TapInterface from './interfaces/tap-interface.js';
import TunInterface from './interfaces/tun-interface.js';
import Server from './server.js';
import Socket from './socket.js';
import Stack, { unwrap } from './stack.js';

export { default as LoopbackInterface } from './interfaces/loopback-interface.js';
export { default as TapInterface } from './interfaces/tap-interface.js';
export { default as TunInterface } from './interfaces/tun-interface.js';
export { default as Stack } from './stack.js';

const tcpipNamespace = {
  Stack,
  LoopbackInterface,
  TapInterface,
  TunInterface,
  Socket,
  Server,
  unwrap,
};

// TODO: find a way to pass this directly to WASM via import object
(globalThis as any)['@tcpip/stack'] = tcpipNamespace;

export async function init(wasm: Module) {
  const go = new Go();
  const instance = await WebAssembly.instantiate(wasm, go.importObject);
  go.run(instance);
}

export async function initStreaming(
  response: Response | PromiseLike<Response>
) {
  const go = new Go();
  const source = await WebAssembly.instantiateStreaming(
    response,
    go.importObject
  );
  go.run(source.instance);
}
