import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The rule that keeps a job alive with the screen off.
 *
 * React Native drives `setTimeout` from the screen's frame clock. When
 * the activity pauses it takes that clock away — see `onHostPause` in
 * `JavaTimerManager.kt` — so with the screen off no timer in JavaScript
 * ever fires. A job holding for a charger asked again every five seconds
 * and therefore asked never: it sat there until somebody woke the phone
 * (user, 2026-08-12).
 *
 * It happened twice. The first fix took the timer out of the wait for a
 * charger; the yield between the strips of every grid was one import
 * away and stopped the job just as dead. The guard written the first
 * time named `precompute.ts` and so reported safety it did not have,
 * which is why the check below follows the imports instead of a list.
 *
 * Nothing type-checks the rule, and acting it out needs a locked device.
 * `test/e2e/background.spec.ts` gets as close as a browser can by
 * killing timers outright; this holds the rule across the whole path in
 * milliseconds. Neither is a phone — see the roadmap.
 */

const here = import.meta.dirname;

const read = (...parts: string[]): string =>
  readFileSync(path.join(here, '..', ...parts), 'utf8');

const precompute = read('src', 'data', 'precompute.ts');
const bridge = read('modules', 'engine-bridge', 'index.ts');
const module_ = read(
  'modules',
  'engine-bridge',
  'android',
  'src',
  'main',
  'java',
  'com',
  'hfcast',
  'engine',
  'HfcastEngineModule.kt',
);

/**
 * The text with its comments taken out.
 *
 * The comments in these files explain the timers that must not be used,
 * so a search over the raw text would match the explanation and fail on
 * the file that is right.
 */
const code = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Every file the job runs through, found by following the imports.
 *
 * Listed rather than named, because naming them is what let the second
 * fault through: the rule was checked against `precompute.ts` alone
 * while the yield that stopped the job sat one import away in
 * `localCoverage.ts`, and the guard reported safety it did not have.
 *
 * The walk stops at the edges of the computing path — `src/data`,
 * `shared` and the engine module. Stores and components are reached from
 * here too, and a timer in one of those is ordinary: they run while
 * somebody is looking at them.
 */
function jobReaches(entry: string): string[] {
  const root = path.join(here, '..');
  const inScope = (file: string): boolean =>
    ['src/data', 'shared', 'modules/engine-bridge']
      .some((dir) =>
        path.relative(root, file).replace(/\\/g, '/').startsWith(dir)
      )
    || path.relative(path.join(root, '..'), file).startsWith('shared');

  const resolve = (from: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const base = path.resolve(path.dirname(from), spec);
    for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
      if (candidate.endsWith('.ts') && existsSync(candidate)) return candidate;
    }
    return null;
  };

  // A breadth-first walk with a seen set. A loop because it is iteration
  // over a list that grows as it is walked, which no fold expresses.
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+'([^']+)'/g)) {
      const next = resolve(file, match[1] ?? '');
      if (next !== null && inScope(next) && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

describe('work that carries on with the screen off', () => {
  it('waits on no timer, in any file the job reaches', () => {
    const entry = path.join(here, '..', 'src', 'data', 'precompute.ts');
    const reached = jobReaches(entry);
    // The walk itself has to be working. One file would mean the imports
    // were not followed and the check below proves nothing.
    assert.ok(
      reached.length > 5,
      `only ${reached.length} files were reached, so the walk is broken`,
    );
    assert.ok(
      reached.some((file) => file.endsWith('localCoverage.ts')),
      'the walk did not reach localCoverage.ts, where the second fault was',
    );

    for (const file of reached) {
      // `breathe.ts` is the one place a timer is allowed, because it is
      // the one place that asks first whether the timer can fire.
      if (file.endsWith('breathe.ts')) continue;
      const text = code(readFileSync(file, 'utf8'));
      for (
        const timer of ['setTimeout', 'setInterval', 'requestAnimationFrame']
      ) {
        assert.ok(
          !text.includes(timer),
          `${path.basename(file)} calls ${timer}. It does not fire with the
             screen off, so a job that reaches it stops there until the
             phone is woken. Yield through breathe(onScreen()) instead`,
        );
      }
    }
  });

  it('never yields without saying whether there is a screen', () => {
    // `breathe()` with no argument is the old fault written again: the
    // argument is the whole of the fix.
    const coverage = read('src', 'data', 'localCoverage.ts');
    assert.ok(
      !code(coverage).includes('breathe()'),
      'breathe() was called with no argument, so it yields off screen too',
    );
    assert.match(code(coverage), /breathe\(onScreen\(\)\)/);
    // And the answer has to come from the lifecycle, not from a guess.
    assert.match(code(coverage), /AppState\.currentState === 'active'/);
  });

  it('listens for the charger instead', () => {
    assert.match(code(precompute), /Engine\.onPowerChanged\(/);
    assert.match(code(bridge), /export function onPowerChanged\(/);
  });

  it('declares the event on the native side', () => {
    // A name that does not match one in `Events` is not a compile error
    // on either side; it is an event that is never delivered.
    assert.match(code(module_), /Events\([^)]*"onPowerChanged"/);
    assert.match(code(module_), /OnStartObserving\("onPowerChanged"\)/);
  });

  it('registers for both directions and gives the receiver back', () => {
    // Connected alone would leave a job that was released by unplugging
    // and re-plugging waiting on an event it had already missed.
    assert.match(code(module_), /ACTION_POWER_CONNECTED/);
    assert.match(code(module_), /ACTION_POWER_DISCONNECTED/);
    // A receiver left registered outlives the job that wanted it and
    // wakes the app on every plug for the rest of the process.
    assert.match(code(module_), /unregisterReceiver/);
    assert.match(code(module_), /OnStopObserving\("onPowerChanged"\)/);
  });

  it('asks to be allowed to show the notification, rather than only declaring it', () => {
    // The manifest test checks POST_NOTIFICATIONS is declared. Declaring
    // it grants nothing from Android 13: without the ask, the service
    // runs and its notification is dropped without a word, which leaves a
    // job in the background with nothing on screen and no Stop button.
    assert.match(code(module_), /AsyncFunction\("askToNotify"\)/);
    assert.match(code(bridge), /export async function askToNotify\(/);
    // And something has to call it. A permission asked for nowhere is
    // the same as one never declared.
    const dialog = read('src', 'components', 'MapsModal.tsx');
    assert.match(code(dialog), /askToNotify\(\)/);
  });

  it('reads the charger rule on every pass, not once at the top', () => {
    // Turning the switch off during a wait has to start the work. Read
    // once, it would be noticed only when the next map finished, and no
    // map finishes while the job is waiting.
    assert.match(code(precompute), /while \(stillWaiting\(signal\)\)/);
    assert.match(code(precompute), /precomputeOnCharger/);
  });
});
