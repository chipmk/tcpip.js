/**
 * The 'web-worker' package is a Node.js polyfill for the Web Worker API.
 *
 * It uses `__filename` to get the current file path, which isn't supported
 * in Node.js ES modules. The equivalent in ES modules is `import.meta.url`.
 *
 * This is an ESBuild patch to replace `__filename` with `import.meta.url`.
 */
const metaUrl = new URL(import.meta.url);

export { metaUrl as __filename };
