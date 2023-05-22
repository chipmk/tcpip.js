import Go from '../go/wasm_exec.js';
export * from '../index.js';

export async function init() {
  const go = new Go();
  const source = await WebAssembly.instantiateStreaming(
    fetch(require('tcpip/tcpip.wasm')),
    go.importObject
  );
  go.run(source.instance);
}
