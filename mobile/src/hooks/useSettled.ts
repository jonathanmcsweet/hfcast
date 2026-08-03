import { useEffect, useState } from 'react';

/**
 * A value that only updates once it has stopped changing.
 *
 * The hour slider reports every intermediate value as a finger moves, which is
 * right for the readouts beside it — they are a lookup in a prediction already
 * held, and should follow the finger. It is wrong for anything that starts work
 * per value.
 *
 * On the device the coverage map is one engine run of 192 paths, and the native
 * module runs them one at a time. Sweeping a whole day would queue two dozen of
 * them and leave the map many seconds behind the slider, each run answering an
 * hour the user had already passed. Waiting for the finger to settle computes
 * the hour they actually chose.
 *
 * Not Zustand: this is a value derived from a prop, not application state.
 */
export function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    // The first value is already the settled one, so this only delays changes.
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, settled, delayMs]);

  return settled;
}
