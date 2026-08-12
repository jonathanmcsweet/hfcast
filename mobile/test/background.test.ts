import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
 * Nothing type-checks that rule and no test can act it out, because the
 * fault needs a locked device. What can be checked is that the code has
 * not gone back to a timer, and that the event it uses instead is
 * declared on both sides of the boundary. It costs milliseconds and it
 * stands in for a device nobody here is holding.
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

describe('work that carries on with the screen off', () => {
  it('waits on no timer', () => {
    // `setInterval` and `requestAnimationFrame` for the same reason, and
    // `sleep` because that helper was the shape the fault took.
    for (
      const timer of ['setTimeout', 'setInterval', 'requestAnimationFrame']
    ) {
      assert.ok(
        !code(precompute).includes(timer),
        `precompute.ts calls ${timer}, which does not fire with the screen
           off, so a job that reaches it stops until the phone is woken`,
      );
    }
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
