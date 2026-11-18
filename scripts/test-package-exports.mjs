import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

// Run built artifacts in plain Node: source transforms can hide packaging bugs.
const packagesUrl = new URL('../packages/', import.meta.url);
for (const directory of readdirSync(packagesUrl, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const packageUrl = new URL(`${directory.name}/`, packagesUrl);
  const pkg = JSON.parse(
    readFileSync(new URL('package.json', packageUrl), 'utf8')
  );
  for (const subpath of Object.keys(pkg.exports)) {
    const specifier = pkg.name + (subpath === '.' ? '' : subpath.slice(1));
    for (const format of ['commonjs', 'module']) {
      test(`${format} loads ${specifier}`, () => {
        const name = JSON.stringify(specifier);
        const source =
          format === 'commonjs'
            ? `require(${name});`
            : `await import(${name});`;
        execFileSync(
          process.execPath,
          [`--input-type=${format}`, '--eval', source],
          {
            cwd: packageUrl,
            timeout: 15000,
            stdio: 'pipe',
          }
        );
      });
    }
  }
}

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
