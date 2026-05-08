/// <reference types="node" />

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createVm } from './util.js';

function parseArgs(args: string[]) {
  const ipIndex = args.indexOf('--ip');
  const ip = ipIndex === -1 ? undefined : args[ipIndex + 1];
  const command = args
    .filter((_, index) => index !== ipIndex && index !== ipIndex + 1)
    .join(' ')
    .trim();

  return { ip, command };
}

async function main() {
  const { ip, command } = parseArgs(process.argv.slice(2));
  const { emulator, executeCommand } = await createVm({ ip });

  try {
    if (command) {
      const output = await executeCommand(command);
      if (output) {
        console.log(output);
      }
      return;
    }

    const readline = createInterface({
      input: stdin,
      output: stdout,
      prompt: 'v86$ ',
    });

    readline.prompt();
    for await (const line of readline) {
      const nextCommand = line.trim();
      if (nextCommand === 'exit') {
        break;
      }

      if (nextCommand) {
        const output = await executeCommand(nextCommand);
        if (output) {
          console.log(output);
        }
      }
      readline.prompt();
    }

    readline.close();
  } finally {
    await emulator.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
