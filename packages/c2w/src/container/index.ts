import { proxy, wrap } from 'comlink';
import Worker from 'web-worker';
import { NetworkInterface } from './network-interface.js';
import { StdioInterface } from './stdio-interface.js';
import type { VM, VMOptions } from './vm.js';

export type ContainerNetOptions = {
  /**
   * The MAC address to assign to the VM.
   *
   * If not provided, a random MAC address will be generated.
   */
  macAddress?: string;
};

export type ContainerOptions = {
  /**
   * The URL of the c2w-compiled WASM file to load.
   */
  wasmUrl: string | URL;

  /**
   * The entrypoint to the container.
   */
  entrypoint?: string;

  /**
   * The command to run in the container.
   */
  command?: string[];

  /**
   * Environment variables to pass to the container.
   */
  env?: Record<string, string>;

  /**
   * Network configuration for the container VM.
   */
  net?: ContainerNetOptions;

  /**
   * Callback when the container VM exits.
   */
  onExit?: (exitCode: number) => void;

  /**
   * Enable debug logging.
   */
  debug?: boolean;
};

/**
 * Creates a `container2wasm` VM.
 *
 * Returns an object with `stdio` and `net` properties, which are interfaces for
 * interacting with the VM's standard I/O and network interfaces.
 */
export async function createContainer(options: ContainerOptions) {
  const stdioInterface = new StdioInterface({
    debug: options.debug,
  });
  const netInterface = new NetworkInterface({
    macAddress: options.net?.macAddress,
    debug: options.debug,
  });

  const vmWorker = await createVMWorker({
    wasmUrl: options.wasmUrl,
    stdio: stdioInterface.vmStdioOptions,
    net: netInterface.vmNetOptions,
    entrypoint: options.entrypoint,
    command: options.command,
    env: options.env,
    debug: options.debug,
  });

  vmWorker.run().then((exitCode) => {
    vmWorker.close();
    options.onExit?.(exitCode);
  });

  return {
    stdio: stdioInterface,
    net: netInterface,
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
      entrypoint: options.entrypoint,
      command: options.command,
      env: options.env,
      debug: options.debug,
    },
    proxy(console.log)
  );
}
