import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Bringing the app up again, which layout direction needs.
 *
 * `requireOptionalNativeModule` rather than `requireNativeModule`: it
 * returns null instead of throwing where the module is not in the running
 * app, which is Expo Go and iOS. Callers ask `isAvailable()` and tell the
 * reader to restart by hand where it answers false.
 */

interface Native {
  restart(): void;
}

const native = requireOptionalNativeModule<Native>('AppRestart');

export const isAvailable = (): boolean => native !== null;

/**
 * Does not return. The process is replaced, so nothing after the call runs.
 */
export function restart(): void {
  if (native === null) throw new Error('This build cannot restart itself');
  native.restart();
}
