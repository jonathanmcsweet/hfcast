import type { Fix } from './index';

/**
 * The same three functions in the browser, over `navigator.geolocation`.
 *
 * No dependency at all here: the browser owns the permission prompt and the
 * provider, which is why the web build never had the Google problem the
 * Android build had. Metro picks this file for the web platform.
 */

const MAX_AGE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 45 * 1000;

const geolocation = (): Geolocation | null =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator
    ? navigator.geolocation
    : null;

export const isAvailable = (): boolean => geolocation() !== null;

/**
 * Always true, because the browser has no way to ask ahead of time.
 *
 * The prompt appears when a position is actually requested, and a refusal
 * arrives there as an error. Reporting false here would hide the button from
 * someone who has not been asked yet.
 */
export async function requestPermission(): Promise<boolean> {
  return isAvailable();
}

export async function hasProvider(): Promise<boolean> {
  return isAvailable();
}

export async function currentFix(): Promise<Fix> {
  const api = geolocation();
  if (api === null) throw new Error('This browser has no geolocation');
  return await new Promise<Fix>((resolve, reject) => {
    api.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          provider: 'browser',
          timestamp: position.timestamp,
        }),
      (error) => reject(new Error(error.message)),
      {
        maximumAge: MAX_AGE_MS,
        timeout: TIMEOUT_MS,
        enableHighAccuracy: false,
      },
    );
  });
}

export type { Fix, Permission } from './index';
