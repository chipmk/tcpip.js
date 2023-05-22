import { readFile } from 'fs/promises';
import Go from '../go/wasm_exec.js';
import './node-polyfills.js';

export * from '../index.js';

export async function init() {
  const wasm = await readFile(require.resolve('tcpip/tcpip.wasm'));
  const go = new Go();
  const source = await WebAssembly.instantiate(wasm, go.importObject);
  go.run(source.instance);
}
