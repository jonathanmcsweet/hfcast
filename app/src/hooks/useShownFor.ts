import { useEffect, useRef, useState } from 'react';

/**
 * True as soon as `active` is, and true for at least `minMs` after that.
 *
 * For marking work a reader has just asked for. The previous rule here
 * was the opposite one — appear only after the work had run for a while,
 * so a fast redraw passed unremarked — and on a device it marked almost
 * nothing: the coarse map is tens of milliseconds and the whole-world
 * grid was refused outright on the hardware it was tried on, so a band
 * change recomputed the map with no sign that anything had happened
 * (user, 2026-08-01: the indicator should show even for short waits).
 *
 * A minimum instead of a delay says the same thing about a long wait and
 * something true about a short one: the tap was received and the map is
 * being recomputed. The floor is what keeps that from being a flicker —
 * a 40 ms run would otherwise appear and vanish inside two frames, which
 * reads as a glitch rather than as feedback.
 */
export function useShownFor(active: boolean, minMs: number): boolean {
  const [shown, setShown] = useState(active);
  // When the current showing began. A ref rather than state because
  // nothing is drawn from it — it only decides when the floor expires,
  // and writing it must not itself cause a render.
  const startedAt = useRef(0);

  useEffect(() => {
    if (active) {
      startedAt.current = Date.now();
      setShown(true);
      return;
    }
    const left = minMs - (Date.now() - startedAt.current);
    if (left <= 0) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(false), left);
    return () => clearTimeout(timer);
  }, [active, minMs]);

  return shown;
}
