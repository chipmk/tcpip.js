/**
 * Utility class to facilitate internal communication
 * between bindings and JS instances.
 * Hooks are created for both the outer (bindings) and
 * inner (JS instance) sides of the communication.
 *
 * Uses `WeakMap` to map each JS instance to a set of
 * hooks while avoiding memory leaks.
 */
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
   * it is disposed. Named after the C++ concept of a unique pointer.
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

  /**
   * Waits for the next `set()` call on the given key.
   */
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
): AsyncIterableIterator<R> {
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
): AsyncIterableIterator<R> {
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

export type UnderlyingSourceLockCallback = () => void;

/**
 * `ReadableStream` with an optional lock callback.
 */
export class ExtendedReadableStream<R> extends ReadableStream<R> {
  #notifyLock?: () => void;

  constructor(
    {
      lock,
      ...underlyingSource
    }: UnderlyingSource & { lock?: UnderlyingSourceLockCallback },
    strategy?: QueuingStrategy<R>
  ) {
    super(underlyingSource, strategy);
    this.#notifyLock = lock;
  }

  override getReader() {
    const reader = super.getReader() as any;
    if (this.locked) {
      this.#notifyLock?.();
    }
    return reader;
  }

  override pipeThrough<T>(
    transform: ReadableWritablePair<T, R>,
    options?: StreamPipeOptions
  ): ReadableStream<T> {
    const stream = super.pipeThrough(transform, options);
    if (this.locked) {
      this.#notifyLock?.();
    }
    return stream;
  }

  override pipeTo(
    dest: WritableStream<R>,
    options?: StreamPipeOptions
  ): Promise<void> {
    const promise = super.pipeTo(dest, options);
    if (this.locked) {
      this.#notifyLock?.();
    }
    return promise;
  }

  override tee(): [ReadableStream<R>, ReadableStream<R>] {
    const [a, b] = super.tee();
    if (this.locked) {
      this.#notifyLock?.();
    }
    return [a, b];
  }
}

/**
 * Queues a microtask and returns a promise that resolves when
 * the microtask is executed.
 *
 * Microtasks are executed after the current task has completed,
 * but before the next task begins (tasks are the main unit of
 * work in the event loop).
 *
 * Useful when you want synchronous code from the current task to
 * complete before executing asynchronous code.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
 */
export async function nextMicrotask() {
  return await new Promise<void>((resolve) => queueMicrotask(resolve));
}

/**
 * Generates a random MAC address.
 *
 * The generated address is locally administered (so won't conflict
 * with real devices) and unicast (so it can be used as a source address).
 */
export function generateMacAddress() {
  const mac = new Uint8Array(6);
  crypto.getRandomValues(mac);

  // Control bits only apply to the first byte
  mac[0] =
    // Clear the 2 least significant bits
    (mac[0]! & 0b11111100) |
    // Set locally administered bit (bit 1) to 1 and unicast bit (bit 0) to 0
    0b00000010;

  return mac;
}
