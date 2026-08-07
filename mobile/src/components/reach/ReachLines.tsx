import { useTranslation } from 'react-i18next';
import { Text, useTheme } from 'react-native-paper';

import type { BandKey, Coverage } from '../../data/types';
import { useFormatters } from '../../hooks/useFormatters';
import { typography } from '../../theme';
import type { AppTheme } from '../../theme';

/**
 * The map's headline numbers, in words.
 *
 * A shape is not a quantity: the difference between two bands is often a
 * shape the eye reads as "about the same", and a pattern of dots is not a
 * distance. These are also the whole of the map for a reader who cannot
 * see it.
 *
 * Both sentences name the band their own grid answered for, never the one
 * the selector is on. The grids arrive separately, so after a band change
 * one of them can still be the previous band's for a moment — and "160m
 * reaches about 8% of the world" carrying 40m's number is wrong in a way
 * no reader can catch.
 *
 * One sentence where both figures are about the same band, two where they
 * are not, for the same reason.
 */
export default function ReachLines(
  { coverage, nvisBand, nvisKm }: {
    coverage: Coverage | undefined;
    /** The band the near-vertical figure came out of, or null. */
    nvisBand: BandKey | null;
    /** How far the near-vertical region reaches, in kilometres, or null. */
    nvisKm: number | null;
  },
) {
  const { t } = useTranslation();
  const theme = useTheme<AppTheme>();
  const f = useFormatters();
  const quiet = { color: theme.colors.ui.text3 };

  if (
    coverage && nvisBand !== null && nvisKm !== null
    && coverage.band === nvisBand
  ) {
    return (
      <Text style={[typography.caption, quiet]}>
        {t('reach.reachAndNvis', {
          band: coverage.band,
          percent: f.percent(coverage.reach),
          distance: f.distance(nvisKm),
        })}
      </Text>
    );
  }

  return (
    <>
      {coverage
        ? (
          <Text style={[typography.caption, quiet]}>
            {t('reach.reachLine', {
              band: coverage.band,
              percent: f.percent(coverage.reach),
            })}
          </Text>
        )
        : null}

      {nvisBand === null || nvisKm === null
        ? null
        : (
          <Text style={[typography.caption, quiet]}>
            {t('reach.nvisReach', {
              band: nvisBand,
              distance: f.distance(nvisKm),
            })}
          </Text>
        )}
    </>
  );
}
