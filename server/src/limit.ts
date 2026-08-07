/**
 * How many engine processes may be alive at once.
 *
 * Every prediction and every strip of an area run is a separate process.
 * Nothing above this file bounded them: `/api/coverage/fine` is a public
 * route with no key, it splits its 34,560-point grid across up to eight
 * processes, and ten callers asking together forked eighty. On the
 * machines this runs on that is the whole box, and the failure is not a
 * slow answer — it is the host swapping and every request timing out.
 *
 * A queue rather than a rejection. A caller that waits gets a slower
 * answer; a caller that is refused gets an error page for a service that
 * was working. The wait is bounded in practice by the run timeout in
 * `voacap/engine.ts`, which fails a run rather than holding a slot for
 * ever.
 *
 * The cap is the core count, to eight. Past eight the processes contend
 * re-reading the coefficient tables and the host gets slower rather than
 * faster — the same measurement that sets `COVERAGE_SHARDS`, and the same
 * ceiling, so one fine grid can fill the machine and the next request
 * waits behind it instead of competing with it.
 *
 * `HFCAST_ENGINE_SLOTS` overrides it, for a host that is doing something
 * else as well.
 */
import { cpus } from 'node:os';

export const ENGINE_SLOTS = (() => {
  const asked = Number(process.env.HFCAST_ENGINE_SLOTS);
  if (Number.isInteger(asked) && asked >= 1) return asked;
  return Math.max(1, Math.min(8, cpus().length));
})();

/**
 * A counting semaphore.
 *
 * Its own class rather than a promise chain, because the order matters:
 * waiters are released first in, first out, so a request that arrived
 * during a fine grid is answered before one that arrived after it.
 */
export class Slots {
  #free: number;
  readonly #waiting: (() => void)[] = [];

  constructor(count: number) {
    this.#free = count;
  }

  /** Runs `work` with a slot held, and gives the slot back either way. */
  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.#take();
    try {
      return await work();
    } finally {
      this.#give();
    }
  }

  /** How many callers are waiting for a slot. For tests and for a log. */
  get waiting(): number {
    return this.#waiting.length;
  }

  get free(): number {
    return this.#free;
  }

  #take(): Promise<void> {
    if (this.#free > 0) {
      this.#free -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resume) => this.#waiting.push(resume));
  }

  #give(): void {
    const next = this.#waiting.shift();
    // Handed straight on rather than counted back up and taken again:
    // between those two steps a caller arriving fresh would overtake
    // everyone already queued.
    if (next === undefined) this.#free += 1;
    else next();
  }
}

/**
 * The one gate every engine process passes through.
 *
 * A module-level instance because the limit is a property of the host,
 * not of a request. Every call into the Rust binary passes through
 * `callPredict`, and a strip of a split grid is one such call, so gating
 * there covers path runs, area runs and shards alike.
 *
 * The Fortran fallback is not gated here. It is bounded already, by the
 * pool of private `itshfbc` trees in `voacap/run.ts` — a run holds one
 * for its duration because voacapl names its scratch files from a global
 * counter. Adding a second gate would only make the smaller of the two
 * limits harder to find.
 *
 * Nothing that holds a slot ever waits for a second one: an area run
 * takes its strips through `Promise.all`, and each strip takes and
 * releases its own. So this cannot deadlock.
 */
const engineSlots = new Slots(ENGINE_SLOTS);

export const withEngineSlot = <T>(work: () => Promise<T>): Promise<T> =>
  engineSlots.run(work);

/** What the gate is doing right now, for `/health`. */
export const engineLoad = () => ({
  slots: ENGINE_SLOTS,
  free: engineSlots.free,
  waiting: engineSlots.waiting,
});
