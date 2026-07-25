/**
 * A small in-memory cache with a time to live.
 *
 * VOACAP output is monthly climatology, so a run stays valid for as long as the
 * sunspot number assumption holds. Caching is what makes an on-demand service
 * behave like pre-generated files for the handful of paths people actually ask
 * about, without needing to enumerate every possible path in advance.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  readonly #entries = new Map<string, Entry<T>>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;

  constructor(ttlMs: number, maxEntries = 500) {
    this.#ttlMs = ttlMs;
    this.#maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const hit = this.#entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    // Refresh insertion order so eviction removes the least recently used.
    this.#entries.delete(key);
    this.#entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
  }

  /** Run `produce` only when the key is absent or stale. */
  async fetch(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await produce();
    this.set(key, value);
    return value;
  }

  get size(): number {
    return this.#entries.size;
  }
}
