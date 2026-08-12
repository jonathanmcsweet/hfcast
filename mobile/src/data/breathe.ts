/**
 * Yielding to the screen, when there is a screen.
 *
 * Long work on the JavaScript thread has to be broken up or the
 * interface stops answering: packing a whole-world grid is 34,560 points
 * and, run as one block, no progress bar moves and no touch is answered
 * for the whole of it. A timeout of zero is the only yield React Native
 * offers that lets the interface run in the gap.
 *
 * That yield must not be taken when the app is not on screen. React
 * Native drives `setTimeout` from the screen's frame clock, and Android
 * takes that clock away when the activity pauses — so with the screen
 * locked the timeout never fires and the work stops where it stood. This
 * is what a job computing maps ahead ran into twice: once waiting for a
 * charger, and once here, between the strips of every grid (user,
 * 2026-08-12).
 *
 * The condition is exact rather than a guess. `AppState` reports
 * "active" from `onHostResume` and "background" from `onHostPause`, and
 * those are the same two callbacks that start and stop the timer clock
 * in `JavaTimerManager`. So the app is active exactly when a timeout
 * will fire, and when it will not there is no screen to yield to
 * anyway.
 *
 * Takes the answer rather than asking for it, so that this file imports
 * nothing and a test can run it under Node. The caller reads `AppState`,
 * which is where that effect belongs.
 */
export function breathe(active: boolean): Promise<void> {
  if (!active) return Promise.resolve();
  return new Promise<void>((resume) => {
    setTimeout(resume, 0);
  });
}
