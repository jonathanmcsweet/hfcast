/**
 * What the launch screen says it is doing, from what the app is actually doing.
 *
 * The design draws a progress bar and a step name under the title. Both could
 * have been a timer — the prototype's was — and that would be a lie told at the
 * one moment a reader has nothing else to judge the app by. So each step is a
 * real query, and the bar moves when one of them settles.
 *
 * Settled, not succeeded. A reading that failed has finished being waited for,
 * and the screen behind this one is honest about what is missing; holding the
 * launch screen open for a retry would be worse than showing a forecast with an
 * empty sun card.
 */

/**
 * In the order they are waited for, which is roughly the order they finish.
 * `bands` is not a step but the end of them: everything is in, and the screen
 * behind is about to appear.
 */
export const LAUNCH_STAGES = ['flux', 'ionosonde', 'model', 'bands'] as const;

export type LaunchStage = (typeof LAUNCH_STAGES)[number];

/** Whether each of the three real steps has finished, however it finished. */
export interface LaunchStatus {
  /** Space weather from SWPC, which is also what makes the run a now-cast. */
  flux: boolean;
  /** The nearest sounding, or the decision that no station is near enough. */
  ionosonde: boolean;
  /** The engine's own run. This is the one the screen genuinely waits for. */
  model: boolean;
}

/**
 * The bar never starts empty.
 *
 * A bar at zero for the first frames reads as stuck rather than as beginning,
 * and the app has in fact already done work by then — it has loaded, read its
 * cache and started three requests.
 */
const FLOOR = 0.08;

/**
 * How long the screen stays up at the least.
 *
 * With a warm cache the engine answers in well under a second, and a launch
 * screen that appears and vanishes inside two frames is a flash rather than a
 * screen. Long enough to read the title, short enough not to be in the way.
 */
export const LAUNCH_FLOOR_MS = 1400;

export interface LaunchProgress {
  /** The step to name. */
  stage: LaunchStage;
  /** 0..1, for the bar. */
  progress: number;
}

export function launchProgress(status: LaunchStatus): LaunchProgress {
  const order: readonly (keyof LaunchStatus)[] = ['flux', 'ionosonde', 'model'];
  const settled = order.filter((key) => status[key]).length;

  // The step named is the first one still outstanding, so the label describes
  // what is being waited for rather than what has just finished. Out of order
  // completion is ordinary — the engine often beats the network — and naming
  // the earliest outstanding one keeps the label from jumping backwards.
  const outstanding = order.find((key) => !status[key]);

  return {
    stage: outstanding ?? 'bands',
    progress: settled === order.length
      ? 1
      : FLOOR + (1 - FLOOR) * (settled / order.length),
  };
}
