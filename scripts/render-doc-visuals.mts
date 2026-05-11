/// <reference types="node" />

import { mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const sourceDir = resolve('docs/visuals/source');
const renderedDir = resolve('docs/visuals/rendered');

const sources = (await readdir(sourceDir))
  .filter((file) => extname(file) === '.html')
  .sort();

if (sources.length === 0) {
  console.log('No doc visuals found.');
  process.exit(0);
}

await mkdir(renderedDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const source of sources) {
    const page = await browser.newPage({
      deviceScaleFactor: 2,
      viewport: { width: 1400, height: 900 },
    });

    const sourcePath = join(sourceDir, source);
    await page.goto(pathToFileURL(sourcePath).href, { timeout: 15_000 });

    const visual = page.locator('[data-visual-root]');
    await visual.waitFor();

    const outputPath = join(renderedDir, `${basename(source, '.html')}.png`);
    await visual.screenshot({
      animations: 'disabled',
      omitBackground: true,
      path: outputPath,
    });

    await page.close();
    console.log(`Rendered ${source} -> ${outputPath}`);
  }
} finally {
  await browser.close();
}
