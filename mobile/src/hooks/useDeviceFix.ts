import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as DeviceLocation from '../../modules/aosp-location';
import { latLonToGrid } from '../data/grid';
import type { Endpoint } from '../data/types';

/**
 * Asking the device where it is.
 *
 * Two screens do this — the first-run page and the location picker — and
 * they had a copy each of the same permission, provider and fix sequence.
 * Only the last step differed: one hands the endpoint to a callback, the
 * other writes it to the store and moves to the far end.
 *
 * The reason to hold it in one place is the ordering, which is not
 * obvious and was explained in one copy only. The other kept the order
 * with no comment, so a later edit could have reversed it without knowing
 * what it was for.
 */
export interface DeviceFix {
  /**
   * Whether this build can ask at all.
   *
   * Both screens hide the button rather than showing one that fails:
   * there is no implementation on iOS or in Expo Go, and typing a place
   * name does the same job.
   */
  available: boolean;
  /** True while the device is being asked. Disables the button. */
  locating: boolean;
  /**
   * Why there is no fix, already translated, or null.
   *
   * A refusal is an ordinary outcome and not an error state: every screen
   * that offers this also offers a search box, which is a complete
   * alternative, so the message says what happened and the reader
   * carries on.
   */
  error: string | null;
  locate: () => Promise<void>;
}

export function useDeviceFix(onFix: (endpoint: Endpoint) => void): DeviceFix {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      if (!await DeviceLocation.requestPermission()) {
        setError(t('location.permissionDenied'));
        return;
      }
      // Said before the wait rather than after it: with no Google services
      // there is usually no network provider, so this is satellites only and
      // a cold fix takes a while. A message that arrives 45 seconds later
      // reads as a fault rather than as an explanation.
      if (!await DeviceLocation.hasProvider()) {
        setError(t('location.noProvider'));
        return;
      }
      const { latitude, longitude } = await DeviceLocation.currentFix();
      // The locator is the label as well. A fix has no place name, and a
      // pair of decimals reads as a measurement rather than as a place.
      const grid = latLonToGrid(latitude, longitude);
      onFix({ grid, label: grid, lat: latitude, lon: longitude });
    } catch {
      setError(t('location.unavailable'));
    } finally {
      setLocating(false);
    }
  }, [onFix, t]);

  return { available: DeviceLocation.isAvailable(), locating, error, locate };
}
