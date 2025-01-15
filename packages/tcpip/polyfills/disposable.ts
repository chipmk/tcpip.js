/**
 * Scoped polyfill for `Symbol.dispose` and `Symbol.asyncDispose` without
 * polluting the global scope. Required for the `using` keyword which we
 * use internally.
 * 
 * We export these symbols as 'Symbol.dispose' and 'Symbol.asyncDispose'
 * which tells ESBuild to inject them into the output bundle.
 * 
 * The below works because Typescript's `using` implementation falls back to
 * `Symbol.for("Symbol.dispose")` and `Symbol.for("Symbol.asyncDispose")` if the
 * built-in `Symbol.dispose` and `Symbol.asyncDispose` are not available.
 */

const DisposeSymbol = Symbol.for('Symbol.dispose');
const AsyncDisposeSymbol = Symbol.for('Symbol.asyncDispose');

export {
  DisposeSymbol as 'Symbol.dispose',
  AsyncDisposeSymbol as 'Symbol.asyncDispose'
};
