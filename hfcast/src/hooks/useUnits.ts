import { getLocales } from 'expo-localization';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  feetToMetres,
  heightRange,
  kmToMiles,
  metresToFeet,
  resolveUnits,
  type UnitSystem,
} from '../data/units';
import { INTL_LOCALES } from '../i18n';
import type { SupportedLanguage } from '../i18n';
import { useSettingsStore } from '../store/useSettingsStore';

/**
 * Feet or metres, and everything needed to show and edit a length in
 * whichever it is.
 *
 * The region comes from the device rather than from the chosen language,
 * because they answer different questions: somebody reading the app in
 * Spanish in Texas still measures their mast in feet. Only when the device
 * offers no region does the language's own locale stand in, and that
 * resolves to metric, which is right almost everywhere.
 */
export function useUnits() {
  const { i18n, t } = useTranslation();
  const preference = useSettingsStore((s) => s.units);

  // A device tag like `en-US` when there is one. `regionCode` is the field
  // that actually carries the country; `languageTag` may be language-only.
  const deviceTag = getLocales()[0];
  const region = deviceTag?.regionCode ?? null;
  const fallback = INTL_LOCALES[i18n.language as SupportedLanguage] ?? 'en-US';
  const locale = region === null
    ? fallback
    : `${deviceTag?.languageCode ?? 'en'}-${region}`;

  const system: UnitSystem = resolveUnits(preference, locale);

  return useMemo(() => ({
    system,
    /** A length held in metres, as the reader's own unit. */
    height: (metres: number) =>
      system === 'metric'
        ? t('units.metres', { value: Math.round(metres) })
        : t('units.feet', { value: Math.round(metresToFeet(metres)) }),
    /** A distance held in kilometres, as the reader's own unit. */
    distance: (km: number) =>
      system === 'metric'
        ? t('units.kilometres', { value: Math.round(km) })
        : t('units.miles', { value: Math.round(kmToMiles(km)) }),
    /**
     * A slider's own scale. The control is calibrated in the reader's
     * unit so its steps land on whole feet rather than on the awkward
     * numbers that come out of converting whole metres.
     */
    heightScale: (metric: { min: number; max: number; }) =>
      heightRange(system, metric),
    /** The stored value for a slider position, always metres. */
    heightToMetres: (value: number) =>
      system === 'metric' ? value : feetToMetres(value),
    /** The slider position for a stored value. */
    heightFromMetres: (metres: number) =>
      system === 'metric' ? metres : Math.round(metresToFeet(metres)),
  }), [system, t]);
}
