/**
 * Waiting that can be given up on.
 *
 * A bare `setTimeout` holds its caller for the whole of its time, which
 * is wrong for a wait that something outside may want to end. The job
 * that computes maps ahead waits for a charger in five-second steps, and
 * without this, pressing Stop would sit there until the step ran out.
 *
 * Its own module, with nothing imported into it, so a test can run it
 * under Node. `precompute.ts` reaches the native engine on the way in
 * and cannot be loaded there at all.
 */

/**
 * Resolves after `ms`, or as soon as `signal` is aborted.
 *
 * It resolves either way rather than rejecting on abort. The caller
 * knows why it stopped waiting — it holds the same signal — and a
 * rejection would make every use of this a try block for something that
 * is not a failure.
 *
 * Already aborted resolves at once, without setting a timer.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish);
  });
}
