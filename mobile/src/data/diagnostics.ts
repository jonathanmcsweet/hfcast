/**
 * Timings from the engine.
 *
 * The runs on the device are the measurement that decides what to work
 * on next, and the parts are charged to different places: the strips run
 * on the module's own threads, and parsing them and packing them into
 * typed arrays runs on the thread that draws. A total hides which half
 * is the cost, and the two need opposite fixes.
 *
 * They are on by default in a development build and off in a release
 * one, which is what stopped every coarse grid, fine grid and patch a
 * reader ever looked at from putting a line in the log of a shipped app.
 *
 * `setDiagnostics` turns them on anyway. That is not a hole in the
 * above: the measurement worth having is of the build that ships. A
 * fast phone reported 3.9 seconds for a grid this engine computes in 0.17
 * on a desktop, and a development build would answer a different
 * question — different optimisation, different bundle, a debug bridge.
 * So the switch exists, it is off until something asks for it, and what
 * it turns on matches what the module itself writes under the same tag.
 *
 * `process.env.NODE_ENV` rather than `__DEV__` for the default: the same
 * test works in the web build and under Node, where the tests run, and
 * Metro replaces it at build time either way.
 */

const byDefault = process.env.NODE_ENV !== 'production';

let asked: boolean | null = null;

/**
 * Turns the lines on or off, whatever the build.
 *
 * Null gives the build's own default back. Returns whether they are on.
 */
export function setDiagnostics(on: boolean | null): boolean {
  asked = on;
  return asked ?? byDefault;
}

/** Whether a line written now would appear. */
export const diagnosticsOn = (): boolean => asked ?? byDefault;

/**
 * Writes one timing line, or nothing.
 *
 * The parts are passed as pairs rather than as a finished string, so a
 * build with the lines off never joins them.
 */
export function timing(
  what: string,
  parts: Readonly<Record<string, string | number>>,
): void {
  if (!diagnosticsOn()) return;
  const described = Object.entries(parts)
    .map(([name, value]) =>
      typeof value === 'number' ? `${name} ${Math.round(value)}` : `${value}`
    )
    .join(' | ');
  console.log(`[hfcast] ${what} | ${described}`);
}
