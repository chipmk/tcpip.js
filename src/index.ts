import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import { readFile } from 'node:fs/promises';
import { parseEthernetFrame, parseMacAddress } from './protocols/ethernet.js';
import { parseIPv4Cidr } from './protocols/ipv4.js';

type Pointer = number;
type TapInterfaceHandle = Pointer;

type Instance = {
  exports: {
    // WASI
    memory: WebAssembly.Memory;
    _start(): unknown;

    // Sys
    malloc(size: number): Pointer;
    free(ptr: Pointer): void;

    // Lib
    init(): void;
    create_tap_interface(
      macAddress: Pointer,
      ipAddress: Pointer,
      netmask: Pointer
    ): TapInterfaceHandle;
    inject_tap_interface(
      handle: TapInterfaceHandle,
      frame: Pointer,
      size: number
    ): void;
  };
};

// Define custom methods
async function createStack() {
  const wasi = new WASI(
    [],
    [],
    [
      new OpenFile(new File([])), // stdin
      ConsoleStdout.lineBuffered((msg) => console.log(`[WASI stdout] ${msg}`)),
      ConsoleStdout.lineBuffered((msg) => console.warn(`[WASI stderr] ${msg}`)),
    ]
  );

  const wasmBytes = await readFile(new URL('../tcpip.wasm', import.meta.url));
  const wasmModule = await WebAssembly.compile(wasmBytes);

  // Instantiate with both WASI and custom imports
  const instance: Instance = (await WebAssembly.instantiate(wasmModule, {
    wasi_snapshot_preview1: wasi.wasiImport,
    env: {
      async receive_frame(
        handle: TapInterfaceHandle,
        framePtr: Pointer,
        length: number
      ) {
        const frame = instance.exports.memory.buffer.slice(
          framePtr,
          framePtr + length
        );
        const parsedFrame = parseEthernetFrame(new Uint8Array(frame));
        console.log('Outbound ethernet frame', parsedFrame);
      },
    },
  })) as unknown as Instance;

  function copyToMemory(data: Uint8Array): Pointer {
    const length = data.length;
    const pointer = instance.exports.malloc(length);

    const memoryView = new Uint8Array(
      instance.exports.memory.buffer,
      pointer,
      length
    );
    memoryView.set(data);

    return pointer;
  }

  wasi.start(instance);

  const macAddress = parseMacAddress('00:11:22:33:44:55');
  const { ipAddress, netmask } = parseIPv4Cidr('192.168.1.2/24');

  const tapInterfaceHandle = instance.exports.create_tap_interface(
    copyToMemory(macAddress),
    copyToMemory(ipAddress),
    copyToMemory(netmask)
  );
}

createStack();
