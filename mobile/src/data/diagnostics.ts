/**
 * Timings from the engine, for a development build only.
 *
 * The runs on the device are the measurement that decides what to work
 * on next, and the parts are charged to different places: the strips run
 * on the module's own threads, and parsing them and packing them into
 * typed arrays runs on the thread that draws. A total hides which half
 * is the cost, and the two need opposite fixes.
 *
 * So the lines are worth keeping and are not worth shipping. They went
 * to `console.log` unconditionally, which put a line in the device log
 * for every coarse grid, fine grid and patch a reader ever looked at, in
 * release builds, on a device with no one reading it.
 *
 * `process.env.NODE_ENV` rather than `__DEV__`: the same test works in
 * the web build and under Node, where the tests run, and Metro replaces
 * it at build time either way — so a release bundle drops the call and
 * the string that would have been built for it.
 */

const enabled = process.env.NODE_ENV !== 'production';

/**
 * Writes one timing line, or nothing.
 *
 * The parts are passed as pairs rather than as a finished string, so a
 * release build never joins them.
 */
export function timing(
  what: string,
  parts: Readonly<Record<string, string | number>>,
): void {
  if (!enabled) return;
  const described = Object.entries(parts)
    .map(([name, value]) =>
      typeof value === 'number' ? `${name} ${Math.round(value)}` : `${value}`
    )
    .join(' | ');
  console.log(`[hfcast] ${what} | ${described}`);
}
