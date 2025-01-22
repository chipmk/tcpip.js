import { proxy, wrap } from 'comlink';
import { NetworkInterface } from './network-interface.js';
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
};

/**
 * Creates a `container2wasm` VM with a network interface.
 */
export async function createContainer(options: ContainerOptions) {
  const netInterface = new NetworkInterface({
    macAddress: options.macAddress,
  });

  const vmWorker = await createVMWorker({
    wasmUrl: options.wasmUrl,
    net: netInterface.vmNetOptions,
  });

  vmWorker.run();

  return {
    netInterface,
  };
}

async function createVMWorker(options: VMOptions) {
  const vmWorker = new Worker(new URL('./vm-worker.ts', import.meta.url), {
    type: 'module',
  });

  const VMWorker = wrap<typeof VM>(vmWorker);
  return await new VMWorker(
    {
      wasmUrl: String(options.wasmUrl),
      net: options.net,
    },
    proxy(console.log)
  );
}
