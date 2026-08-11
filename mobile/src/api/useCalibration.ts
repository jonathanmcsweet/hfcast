import { useEffect } from 'react';

import {
  calibrate,
  CALIBRATE_DELAY_MS,
  dropCalibration,
} from '../data/calibrate';

/**
 * Starts the device measuring itself, well behind everything visible.
 *
 * A hook so it lives with the map: while a map is mounted the engine is
 * warm and the reader is looking at the result of the very number being
 * measured. Unmounting gives up any probe still queued — the engine
 * queue prefers the reader's work anyway, so what this cancels is only
 * work nobody is waiting for.
 *
 * `calibrate` itself decides whether there is anything to do; this hook
 * only decides when.
 */
export function useCalibration(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const begin = setTimeout(() => {
      void calibrate();
    }, CALIBRATE_DELAY_MS);
    return () => {
      clearTimeout(begin);
      dropCalibration();
    };
  }, [enabled]);
}
