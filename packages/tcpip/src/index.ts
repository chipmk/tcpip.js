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

export async function init() {}
