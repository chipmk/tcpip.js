import { proxy, wrap } from 'comlink';
import type { Net } from './workers/net-worker.js';
import type { VM } from './workers/vm-worker.js';

async function createVMWorker(
  readBuffer: SharedArrayBuffer,
  writeBuffer: SharedArrayBuffer
) {
  const vmWorker = new Worker(
    new URL('./workers/vm-worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );

  const VMWorker = wrap<typeof VM>(vmWorker);
  return await new VMWorker(readBuffer, writeBuffer, proxy(console.log));
}

async function createNetWorker(
  readBuffer: SharedArrayBuffer,
  writeBuffer: SharedArrayBuffer
) {
  const netWorker = new Worker(
    new URL('./workers/net-worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );

  const NetWorker = wrap<typeof Net>(netWorker);
  return await new NetWorker(readBuffer, writeBuffer, proxy(console.log));
}

/**
 * Things I need to do:
 * 1. Implement poll_oneoff in the VM Worker WASI interface
 * 2. Handle sock_recv and sock_send in the VM Worker WASI interface
 * 3. Use CommManager/RingBuffer to communicate between the VM and Net worker
 * 4. Relay messages from Net worker to/from the main thread asynchronously
 * 5. Pipe message frames from the Net worker to/from tcpip.js
 * 6. Implement DHCP server in tcpip.js
 */

export async function createContainer() {
  const netToVmBuffer = new SharedArrayBuffer(1024);
  const vmToNetBuffer = new SharedArrayBuffer(1024);

  // Initialize the shared data
  const netToVmView = new Int32Array(netToVmBuffer);
  const vmToNetView = new Int32Array(vmToNetBuffer);
  Atomics.store(netToVmView, 0, 0);
  Atomics.store(vmToNetView, 0, 0);

  const vmWorker = await createVMWorker(netToVmBuffer, vmToNetBuffer);
  const netWorker = await createNetWorker(vmToNetBuffer, netToVmBuffer);

  vmWorker.run();
  const result = await netWorker.send('world2');

  console.log('Received value from net-worker:', result);
}
