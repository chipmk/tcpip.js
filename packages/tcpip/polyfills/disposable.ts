/**
 * Scoped polyfill for `Symbol.dispose` without polluting the global scope.
 * Required for the `using` keyword which we use internally.
 * 
 * We export this symbol as 'Symbol.dispose' which tells ESBuild to inject
 * it into the output bundle.
 * 
 * The below works because Typescript's `using` implementation falls back to
 * `Symbol.for("Symbol.dispose")` if the built-in `Symbol.dispose` is not available.
 */

const DisposeSymbol = 'dispose' in (Symbol as object) ? Symbol.dispose : Symbol.for('Symbol.dispose');

export {
  DisposeSymbol as 'Symbol.dispose'
};
