/**
 * Which engine work goes first.
 *
 * The engine module runs one request at a time — see the single-thread
 * executor in `HfcastEngineModule.kt` — and a request cannot be taken
 * back once it has been handed over. So work started in the background
 * does not run beside the reader's next request, it runs in front of it.
 * That is not a theory: filling every band in behind the map made a band
 * change take about 30 seconds on a fast phone against 3.4 for the run
 * alone (user, 2026-08-01).
 *
 * This puts one queue in front of the module, with two lanes. Work the
 * reader is waiting for goes in `now`. Work that fills the map in
 * afterwards goes in `later`, and never starts while anything is waiting
 * in `now`.
 *
 * That leaves one delay this cannot remove: a `later` piece already
 * handed to the module has to finish before a `now` piece can start. The
 * bound on that delay is the size of one `later` piece, which is why
 * background work is submitted in pieces rather than whole. See
 * `BACKGROUND_PIECE_POINTS`.
 */

/**
 * How much of a grid one background piece covers.
 *
 * The whole of the delay a reader can suffer from background work is one
 * piece of it. At about 0.03 ms a point on this container's cores and
 * perhaps six times that on a phone, 1,500 points is under a third of a
 * second — short enough that a scrub started at the wrong moment still
 * feels like a scrub.
 *
 * Smaller would be safer and slower: every piece pays for its own
 * coefficient load, about 16 ms.
 */
export const BACKGROUND_PIECE_POINTS = 1500;

type Lane = 'now' | 'later';

interface Waiting {
  lane: Lane;
  /** What `dropLater` matches on. Background work only. */
  group: string | null;
  start: () => void;
  /** Called instead of `start` when the piece is given up. */
  giveUp: (reason: Error) => void;
}

let waiting: readonly Waiting[] = [];
let running = false;

/**
 * Starts the next piece of work, if the module is free and there is any.
 *
 * Everything in `now` goes before anything in `later`, whatever order
 * they were asked in. A `later` piece that has already started is not
 * interrupted — nothing here can interrupt it — so this only decides
 * what starts next.
 */
function pump(): void {
  if (running) return;
  const job = waiting.find((each) => each.lane === 'now') ?? waiting[0];
  if (job === undefined) return;
  waiting = waiting.filter((each) => each !== job);
  running = true;
  job.start();
}

function queue<T>(
  lane: Lane,
  group: string | null,
  work: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((settle, fail) => {
    waiting = [...waiting, {
      lane,
      group,
      start: () => {
        work().then(settle, fail).finally(() => {
          running = false;
          pump();
        });
      },
      giveUp: fail,
    }];
    pump();
  });
}

/** Work the reader is waiting for. */
export const runNow = <T>(work: () => Promise<T>): Promise<T> =>
  queue('now', null, work);

/**
 * Work that fills the map in afterwards.
 *
 * `group` is what `dropLater` matches on, so work for a band the reader
 * has moved away from can be given up rather than run to completion in
 * front of the band they are looking at now.
 */
export const runLater = <T>(
  group: string,
  work: () => Promise<T>,
): Promise<T> => queue('later', group, work);

/**
 * Gives up background work that has not started.
 *
 * Returns how many pieces were dropped. Each one's promise fails with
 * `DROPPED`, which callers read as "no longer wanted" rather than as a
 * fault worth reporting. A piece already handed to the module is not in
 * the list and runs to the end.
 */
export function dropLater(group: string): number {
  const doomed = waiting.filter((job) => job.group === group);
  // The list is replaced before any piece is failed, so a handler that
  // queues more work in response does not meet one that is already gone.
  waiting = waiting.filter((job) => job.group !== group);
  // `for...of` rather than `forEach`: this is iteration for its effect,
  // which is the form the linter requires and the style guide allows.
  for (const job of doomed) job.giveUp(new Error(DROPPED));
  return doomed.length;
}

/** What a dropped piece fails with. */
export const DROPPED = 'the engine queue dropped this piece';

/** Whether a failure is a piece that was given up rather than a fault. */
export const wasDropped = (e: unknown): boolean =>
  e instanceof Error && e.message === DROPPED;

/** How much work is waiting, for the diagnostics line. */
export const queueDepth = (): { now: number; later: number; } => ({
  now: waiting.filter((job) => job.lane === 'now').length,
  later: waiting.filter((job) => job.lane === 'later').length,
});
