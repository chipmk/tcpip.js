export class Hooks<K extends WeakKey, O, I> {
  #outerHooks = new WeakMap<K, O>();
  #innerHooks = new WeakMap<K, I>();

  setOuter(key: K, hooks: O) {
    this.#outerHooks.set(key, hooks);
  }

  setInner(key: K, hooks: I) {
    this.#innerHooks.set(key, hooks);
  }

  getOuter(key: K) {
    const hooks = this.#outerHooks.get(key);

    if (!hooks) {
      throw new Error(`outer hooks not set for ${key}`);
    }

    return hooks;
  }

  getInner(key: K) {
    const hooks = this.#innerHooks.get(key);

    if (!hooks) {
      throw new Error(`inner hooks not set for ${key}`);
    }

    return hooks;
  }
}

export class UniquePointer extends Number {
  free: (ptr: number) => void;

  /**
   * A unique pointer that will automatically free virtual memory when
   * it is garbage collected. Named after the C++ concept of a unique pointer.
   *
   * Should be used with the `using` keyword to ensure that the pointer is
   * freed (via dispose function) when it is no longer in scope.
   *
   * Useful with WASM modules that require allocating and freeing memory.
   *
   * @example
   * ```ts
   * using ptr = new UniquePointer(wasmBridge.malloc(10), wasmBridge.free);
   * ```
   *
   * @param address The address of the pointer
   * @param free The function to call to free the pointer
   */
  constructor(address: number, free: (ptr: number) => void) {
    super(address);
    this.free = free;
  }

  [Symbol.dispose]() {
    this.free(this.valueOf());
  }
}

/**
 * Map that allows waiting for changes to values.
 */
export class EventMap<K, V> extends Map<K, V> {
  #listeners = new Map<K, Set<(value: V) => void>>();

  wait(key: K): Promise<V> {
    return new Promise((resolve) => {
      const listeners = this.#listeners.get(key) ?? new Set();
      listeners.add(resolve);
      this.#listeners.set(key, listeners);
    });
  }

  override set(key: K, value: V) {
    super.set(key, value);

    const listeners = this.#listeners.get(key);

    if (listeners) {
      for (const listener of listeners) {
        listener(value);
        listeners.delete(listener);
      }
    }

    return this;
  }
}

/**
 * Converts a `ReadableStream` into an `AsyncIterableIterator`.
 *
 * Allows you to use ReadableStreams in a `for await ... of` loop.
 */
export function fromReadable<R>(
  readable: ReadableStream<R>,
  options?: { preventCancel?: boolean }
): AsyncIterator<R> {
  const reader = readable.getReader();
  return fromReader(reader, options);
}

/**
 * Converts a `ReadableStreamDefaultReader` into an `AsyncIterableIterator`.
 *
 * Allows you to use Readers in a `for await ... of` loop.
 */
export async function* fromReader<R>(
  reader: ReadableStreamDefaultReader<R>,
  options?: { preventCancel?: boolean }
): AsyncIterator<R> {
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return value;
      }
      yield value;
    }
  } finally {
    if (!options?.preventCancel) {
      await reader.cancel();
    }
    reader.releaseLock();
  }
}
