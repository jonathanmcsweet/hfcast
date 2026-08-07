/**
 * A small in-memory cache with a time to live.
 *
 * VOACAP output is monthly climatology, so a run stays valid for as long as the
 * sunspot number assumption holds. Caching is what makes an on-demand service
 * behave like pre-generated files for the handful of paths people actually ask
 * about, without needing to enumerate every possible path in advance.
 *
 * A key that is already being computed is held as well as a key that has
 * been. Without that the cache only helps the second caller to *finish*,
 * not the second caller to *arrive*: `get` misses until the first run
 * writes its answer, so N requests for one key that arrive together run
 * the engine N times and then store the same value N times. For the fine
 * grid that is N runs of up to eight processes each for one answer.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  readonly #entries = new Map<string, Entry<T>>();
  /**
   * Keys with a `fetch` in progress, and the promise to wait on.
   *
   * Not a second cache: an entry lives here only while its producer runs,
   * and a failed one is removed rather than remembered, so a request that
   * fails does not poison the ones after it.
   */
  readonly #pending = new Map<string, Promise<T>>();
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

  /**
   * Run `produce` only when the key is absent, stale, and not already
   * running.
   *
   * A caller arriving while another is producing the same key waits on
   * that one instead of starting a second. They receive the same value,
   * or the same failure.
   */
  async fetch(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    const running = this.#pending.get(key);
    if (running !== undefined) return await running;

    const started = (async () => {
      const value = await produce();
      this.set(key, value);
      return value;
    })();
    // Registered before it is awaited, so a caller arriving during the
    // first `await` inside `produce` finds it.
    this.#pending.set(key, started);
    try {
      return await started;
    } finally {
      // Whether it answered or threw. A rejection is not cached, so the
      // next request tries again rather than being handed the failure of
      // one that happened to be first.
      this.#pending.delete(key);
    }
  }

  get size(): number {
    return this.#entries.size;
  }

  /** How many keys are being produced right now. For tests. */
  get running(): number {
    return this.#pending.size;
  }
}
