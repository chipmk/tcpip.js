/// <reference path="./v86.d.ts" />

import { createWriteStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { V86 } from 'v86';
import { createV86NetworkStream } from '../src/index.js';

const require = createRequire(import.meta.url);

/**
 * Checks if a given path exists.
 */
export async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads a file from the given URL to the specified path.
 *
 * The destination directory will be created if it does not exist.
 * If the file already exists, it will not be downloaded again.
 */
export async function downloadFile(url: string, path: string) {
  if (await pathExists(path)) {
    return;
  }

  const destinationDir = dirname(path);
  await mkdir(destinationDir, { recursive: true });

  if (!(await pathExists(destinationDir))) {
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`No response body for ${url}`);
  }

  const writeStream = Writable.toWeb(createWriteStream(path));
  await response.body.pipeTo(writeStream);
}

export type CreateVmOptions = {
  ip?: string;
  promptSequence?: string;
};

export async function createVm({
  ip,
  promptSequence = '~% ',
}: CreateVmOptions = {}) {
  const emulator = new V86({
    wasm_path: `${dirname(require.resolve('v86'))}/v86.wasm`,
    bios: { url: join(import.meta.dirname, './images/seabios.bin') },
    cdrom: { url: join(import.meta.dirname, './images/linux4.iso') },
    cmdline: 'tsc=reliable mitigations=off random.trust_cpu=on',
    autostart: true,
    disable_keyboard: true,
  });

  async function waitForSequence(sequence: string) {
    let serialBuffer = '';

    let resolve: (buffer: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });

    const listener = (byte: number) => {
      const char = String.fromCharCode(byte);
      serialBuffer += char;
      if (serialBuffer.endsWith(sequence)) {
        emulator.remove_listener('serial0-output-byte', listener);
        resolve(serialBuffer);
      }
    };

    emulator.add_listener('serial0-output-byte', listener);

    return await promise;
  }

  async function executeCommand(command: string) {
    const commandPromise = waitForSequence(promptSequence);
    emulator.serial0_send(`${command}\n`);
    const result = await commandPromise;

    const commandIndex = result.indexOf(command);
    const promptIndex = result.indexOf(promptSequence);

    // Trim off the command and the prompt
    if (commandIndex !== -1 && promptIndex !== -1) {
      return result.slice(commandIndex + command.length, promptIndex).trim();
    }

    return result;
  }

  await waitForSequence(promptSequence);
  if (ip) {
    await executeCommand(`ip addr add ${ip} dev eth0`);
  }
  await executeCommand('ip link set eth0 up');

  const net = createV86NetworkStream(emulator);

  return { emulator, net, executeCommand };
}

export async function nextValue<T>(
  iterable: Iterable<T> | AsyncIterable<T> | ReadableStream<T>
) {
  if (iterable instanceof ReadableStream) {
    const reader = iterable.getReader();
    try {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error('reader done');
      }
      return value;
    } finally {
      reader.releaseLock();
    }
  }

  const iterator =
    Symbol.asyncIterator in iterable
      ? iterable[Symbol.asyncIterator]()
      : iterable[Symbol.iterator]();

  const { value, done } = await iterator.next();
  if (done) {
    throw new Error('iterator done');
  }
  return value;
}
