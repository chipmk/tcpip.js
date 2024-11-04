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
