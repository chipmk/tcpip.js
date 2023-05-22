// This import must come first
import './node-polyfills.js';

import { readFile } from 'fs/promises';
import Go from '../go/wasm_exec.js';

export * from '../index.js';

export async function init() {
  const wasm = await readFile(require.resolve('tcpip/tcpip.wasm'));
  const go = new Go();
  const source = await WebAssembly.instantiate(wasm, go.importObject);
  go.run(source.instance);
}
