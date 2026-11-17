import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

// Run built artifacts in plain Node: source transforms can hide packaging bugs.
for (const format of ['commonjs', 'module']) {
  test(`${format} package exports initialize both WASM modules`, () => {
    const imports =
      format === 'commonjs'
        ? `const { createStack } = require('tcpip');
         const { createHttp } = require('@tcpip/http');
         require('tcpip/types');`
        : `import { createStack } from 'tcpip';
         import { createHttp } from '@tcpip/http';
         import 'tcpip/types';`;
    const output = execFileSync(
      process.execPath,
      [
        `--input-type=${format}`,
        '--eval',
        `${imports}
       (async () => {
         const stack = await createStack();
         await createHttp(stack.tcp);
         console.log([...stack.interfaces][0]?.ip);
         process.exit(0);
       })().catch((error) => {
         console.error(error);
         process.exit(1);
       });`,
      ],
      {
        cwd: new URL('../packages/http/', import.meta.url),
        encoding: 'utf8',
        timeout: 15000,
      }
    );
    assert.equal(output.trim(), '127.0.0.1');
  });
}
