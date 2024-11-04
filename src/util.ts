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
