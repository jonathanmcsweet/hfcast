/**
 * What computing ahead would cost, and in what order to do it.
 *
 * A person at home with a charger can compute maps they will need on a
 * hill with no network. This module answers the two questions that has
 * to be asked before it starts — how long, and how much room — and
 * decides the order, so that stopping half way still leaves the useful
 * half done.
 *
 * The unit of work is one band at one hour of one month, and the number
 * of bands multiplies both the time and the room.
 *
 * That is worth saying plainly, because the coarse map does not work
 * that way. `coverAllBandsLocally` asks the engine for every band in a
 * single pass and gets them for far less than nine times one — measured
 * in the engine at 297 ms against 1,008 for eight bands. The whole-world
 * fine grid has no such pass yet: `coverFineLocally` asks for one band.
 * So a person who keeps nine bands waits nine times as long as one who
 * keeps one, and choosing fewer bands is the strongest thing they can do
 * to make a large scope finish.
 *
 * Giving the fine grid the multi-band pass the coarse map already has
 * would cut this by about three times. It is not done here because the
 * answer for nine bands at 34,560 points arrives as one reply, and that
 * is nine times the memory on the devices least able to spare it.
 *
 * No React, no engine, no file system, so `node --test` runs it — see
 * `precomputePlan.test.ts`.
 */
import { globeFileBytes } from './globeCodec.ts';
import { hoursFrom } from './timeline.ts';

/** How many months ahead a person may ask for, including this one. */
export const SCOPE_MONTHS = [1, 3, 12] as const;

export type ScopeMonths = typeof SCOPE_MONTHS[number];

/** One run: every band at one hour of one month. */
export interface MonthHour {
  year: number;
  month: number;
  hour: number;
}

/** Where the calendar is now, in UTC, as the plan counts from. */
export interface Now {
  year: number;
  month: number;
  hour: number;
}

/** What a plan will cost. */
export interface Cost {
  /** Hours left to do. One is one hour of one month, at every band kept. */
  hours: number;
  /** Engine runs, and files written: one of each a band an hour. */
  files: number;
  bytes: number;
  ms: number;
}

/**
 * The months a scope covers, this one first.
 *
 * December rolls into January of the next year, which is the only thing
 * here that is not addition.
 */
export function monthsAhead(
  from: { year: number; month: number; },
  count: number,
): readonly { year: number; month: number; }[] {
  const wanted = Math.max(0, Math.floor(count));
  return Array.from({ length: wanted }, (_, step) => {
    const zeroBased = from.month - 1 + step;
    return {
      year: from.year + Math.floor(zeroBased / 12),
      month: (zeroBased % 12) + 1,
    };
  });
}

/**
 * Every run a scope asks for, in the order to do them.
 *
 * This month before next, and inside each month the hour it is now
 * first, coming back round — which is `hoursFrom`, the same order the
 * timeline offers hours in. Both orders exist for the same reason: work
 * stopped part way through should have done the useful part, and the
 * hour a person is in is the best guess anybody has about which hours
 * they will open.
 */
export function runsFor(now: Now, months: number): readonly MonthHour[] {
  const hours = hoursFrom(((now.hour % 24) + 24) % 24);
  return monthsAhead(now, months).flatMap((each) =>
    hours.map((hour) => ({ year: each.year, month: each.month, hour }))
  );
}

/**
 * What the runs still to do will cost.
 *
 * `msPerPoint` is this device's own measured speed at the thread count
 * it measured fastest at — never a number assumed from a fast device.
 * See `calibrate.ts`. Where nothing has been measured yet the caller
 * has no estimate to give, and should say so rather than invent one.
 */
export function costOf(
  hours: number,
  bands: number,
  points: number,
  msPerPoint: number,
): Cost {
  const left = Math.max(0, Math.floor(hours));
  const files = left * Math.max(0, Math.floor(bands));
  return {
    hours: left,
    files,
    bytes: files * globeFileBytes(points),
    // One engine run a band, not one an hour. See the note at the top:
    // the fine grid has no multi-band pass, so the bands multiply here.
    ms: files * points * Math.max(0, msPerPoint),
  };
}

/**
 * How many files the room allows, for the message that says where the
 * work will stop.
 */
export function filesWithin(budgetBytes: number, points: number): number {
  return Math.max(0, Math.floor(budgetBytes / globeFileBytes(points)));
}
