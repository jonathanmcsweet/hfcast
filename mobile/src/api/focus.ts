import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

/**
 * Tells React Query when the app is in front.
 *
 * React Query refetches stale queries on focus, but on a device it has
 * no idea what focus is: there is no window there, so without this the
 * app coming back from the background is invisible to it. `AppState` is
 * the platform's answer — 'active' when the app is in front — and the
 * web build maps it to the page's visibility, so one wiring serves
 * both.
 *
 * The refetch respects each query's `staleTime`. Backgrounded for five
 * minutes, nothing happens on return; backgrounded past the poll
 * interval, the readings are asked for once. That is the same restraint
 * as `data/refreshPolicy.ts`, arrived at from the other side: the timer
 * cannot fire in the background, and this is what catches the app up.
 */
export function wireFocus(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    focusManager.setFocused(state === 'active');
  });
  return () => sub.remove();
}
