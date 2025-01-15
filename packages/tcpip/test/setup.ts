/**
 * Polyfill for runtimes that don't support `Symbol.dispose` and `Symbol.asyncDispose`.
 * Required for the `using` keyword which we use internally.
 *
 * Only used in tests. In production builds, these symbols are injected by ESBuild
 * as a scoped polyfill without polluting the global scope.
 */

(Symbol as any).dispose ??= Symbol.for('Symbol.dispose');
(Symbol as any).asyncDispose ??= Symbol.for('Symbol.asyncDispose');
