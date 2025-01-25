import { proxy, wrap } from 'comlink';
import Worker from 'web-worker';
import { NetworkInterface } from './network-interface.js';
import { StdioInterface } from './stdio-interface.js';
import type { VM, VMOptions } from './vm.js';

export type ContainerOptions = {
  /**
   * The URL of the c2w-compiled WASM file to load.
   */
  wasmUrl: string | URL;

  /**
   * The MAC address to assign to the VM.
   *
   * If not provided, a random MAC address will be generated.
   */
  macAddress?: string;

  onExit?: (exitCode: number) => void;
};

/**
 * Creates a `container2wasm` VM with a network interface.
 */
export async function createContainer(options: ContainerOptions) {
  const stdioInterface = new StdioInterface();
  const netInterface = new NetworkInterface({
    macAddress: options.macAddress,
  });

  const vmWorker = await createVMWorker({
    wasmUrl: options.wasmUrl,
    stdio: stdioInterface.vmStdioOptions,
    net: netInterface.vmNetOptions,
  });

  vmWorker.run().then((exitCode) => {
    vmWorker.close();
    options.onExit?.(exitCode);
  });

  return {
    stdioInterface,
    netInterface,
  };
}

async function createVMWorker(options: VMOptions) {
  const worker = new Worker(new URL('./vm-worker.ts', import.meta.url), {
    type: 'module',
  });

  const VMWorker = wrap<typeof VM>(worker);
  return await new VMWorker(
    {
      wasmUrl: String(options.wasmUrl),
      stdio: options.stdio,
      net: options.net,
    },
    proxy(console.log)
  );
}
