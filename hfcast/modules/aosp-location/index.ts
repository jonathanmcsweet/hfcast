import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The device's own position, without any Google dependency.
 *
 * The native side is `android.location.LocationManager`, which is AOSP. See
 * the Kotlin module for why, and for what it costs.
 *
 * `requireOptionalNativeModule` rather than `requireNativeModule`: it returns
 * null instead of throwing when the module is not in the running app. That is
 * the normal case twice over — Expo Go cannot contain a module from this
 * project, and there is no iOS implementation yet — so the caller asks
 * `isAvailable()` and leaves the button out where it would not work.
 */

export interface Fix {
  latitude: number;
  longitude: number;
  /** Metres, or null where the provider gave no figure. */
  accuracy: number | null;
  /** Which provider answered: `gps`, `network` or `passive`. */
  provider: string;
  /** Milliseconds since the epoch, as the provider timed the fix. */
  timestamp: number;
}

export interface Permission {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

interface Native {
  requestPermissions(): Promise<Permission>;
  getPermissions(): Promise<Permission>;
  hasProvider(): Promise<boolean>;
  getCurrentPosition(maxAgeMs: number, timeoutMs: number): Promise<Fix>;
}

const native = requireOptionalNativeModule<Native>('AospLocation');

/**
 * A cached fix this old is still used. A station's position is not a moving
 * quantity, and a cold satellite fix can take a minute.
 */
const MAX_AGE_MS = 5 * 60 * 1000;

/** Long enough for satellites with a clear sky, short enough to give up. */
const TIMEOUT_MS = 45 * 1000;

export const isAvailable = (): boolean => native !== null;

export async function requestPermission(): Promise<boolean> {
  if (native === null) return false;
  const result = await native.requestPermissions();
  return result.granted;
}

/** Whether anything on the device can answer, so a refusal can say why. */
export async function hasProvider(): Promise<boolean> {
  if (native === null) return false;
  return await native.hasProvider();
}

export async function currentFix(): Promise<Fix> {
  if (native === null) throw new Error('No location provider on this platform');
  return await native.getCurrentPosition(MAX_AGE_MS, TIMEOUT_MS);
}
