import { useEffect, useState } from 'react';

/**
 * True only once `active` has stayed true for `delayMs`, and false the
 * moment it stops.
 *
 * For work that is usually fast and occasionally slow. The whole-world
 * fine grid comes from the server's cache in about 76 ms and from a cold
 * run in about 440 ms, so a mark that appeared the instant it started
 * would flash and vanish on most views — noise on every band and hour
 * change, and worse than showing nothing.
 *
 * Asymmetric on purpose. Turning on is delayed so a short wait passes
 * unremarked; turning off is immediate, because a mark that outlived the
 * work would say the map is still changing when it has finished.
 */
export function useHeldOn(active: boolean, delayMs: number): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return held;
}
