/**
 * `using` is compiled to try / finally, but the compiled code still looks up `Symbol.dispose` at runtime. Browsers
 * without native support need the two symbols, and they have to exist before any class with a `[Symbol.dispose]`
 * method is defined. This is the only global the library touches on import.
 */
// SAFETY: only widens the two properties to writable, which they are in a browser that does not define them yet
const symbols = Symbol as { dispose?: symbol; asyncDispose?: symbol }

symbols.dispose ??= Symbol('Symbol.dispose')

symbols.asyncDispose ??= Symbol('Symbol.asyncDispose')
