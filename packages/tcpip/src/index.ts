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
export { Net, default as Stack } from './stack.js';

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

// Implemented per platform
export async function init() {
  throw new Error('init() not implemented on this platform - use initFrom()');
}

// Escape hatch to import WASM file manually
export async function initFrom(wasm: BufferSource | WebAssembly.Module) {
  const go = new Go();
  const instance = await WebAssembly.instantiate(wasm, go.importObject);
  go.run(instance);
}
