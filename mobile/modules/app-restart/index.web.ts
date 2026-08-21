/**
 * The same restart in the browser, over `location.reload`.
 *
 * Metro picks this file for the web platform. Direction is a stylesheet
 * there rather than a native layout pass, so the reload is only needed to
 * make the browser lay the page out again.
 */

export const isAvailable = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.location?.reload === 'function';

export function restart(): void {
  if (!isAvailable()) throw new Error('This browser cannot reload itself');
  window.location.reload();
}
