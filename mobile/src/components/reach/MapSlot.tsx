import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, useTheme } from 'react-native-paper';

import type {
  Coverage,
  CoveragePatch,
  Endpoint,
  FineGlobe,
  MapRegion,
} from '../../data/types';
import type { AppTheme } from '../../theme';
import CoverageGlobe from '../CoverageGlobe';

/**
 * The square the map is drawn in, and the bar that says it is working.
 *
 * The slot is measured rather than assumed, so the same card works in a
 * phone's column and a tablet's.
 */

/**
 * The tallest the map is allowed to be.
 *
 * The cap exists to keep the card above the fold: on a 1280x800 tablet in
 * landscape the whole answer — readout, map and clock — has to fit the
 * first screen, and the map is the only part that can give.
 *
 * It was 322, which was narrower than the card on an ordinary phone, so
 * the map sat inset from the readout above it and the sides did not line
 * up (user, 2026-08-01). A fast phone gives the card 347 points of inside
 * width, and a large phone about 366, so this covers both and the map
 * fills the card on either.
 *
 * The room came from the headline this card used to carry. Removing it
 * gave back its two lines and the gap under them, which is close to the
 * 58 points added here — so the fold is where it was.
 */
const MAX_MAP = 380;

export default function MapSlot(
  {
    coverage,
    patch,
    fine,
    from,
    to,
    toClosed,
    hour,
    onRegion,
    onPanning,
    busy,
    busyLabel,
  }: {
    coverage: Coverage | null | undefined;
    patch: CoveragePatch | null;
    fine: FineGlobe | null;
    from: Endpoint;
    to: Endpoint | null;
    toClosed: boolean;
    hour: number;
    onRegion: (region: MapRegion | null) => void;
    onPanning?: ((active: boolean) => void) | undefined;
    /** Whether anything the map is drawn from is still coming. */
    busy: boolean;
    /** What that wait is, for a reader who cannot see the bar. */
    busyLabel: string;
  },
) {
  const theme = useTheme<AppTheme>();
  const [width, setWidth] = useState(0);
  // Square, because the projection is a disc.
  const size = Math.min(width, MAX_MAP);

  return (
    <View
      style={styles.slot}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0
        ? (
          <View style={{ width: size, height: size }}>
            <CoverageGlobe
              coverage={coverage}
              patch={patch}
              fine={fine}
              from={from}
              to={to}
              toClosed={toClosed}
              hour={hour}
              size={size}
              onRegion={onRegion}
              onPanning={onPanning}
            />

            {
              /* The map is being recomputed, or made finer.

                 On the map's own bottom edge (user, 2026-08-01), and
                 positioned rather than stacked, so it takes no height
                 and nothing below it moves as it comes and goes. It
                 spans the map exactly, which is what makes it read as
                 belonging to the map rather than to the card.

                 Below the disc rather than across it: whatever is on
                 screen is already a correct answer to something — the
                 previous band, or this one at a coarser step — so this
                 marks the next answer arriving, not the map being
                 unusable.

                 The bar carries no text, so the label is what a screen
                 reader announces. `accessibilityLiveRegion` says it
                 without moving focus, which matters because the reader
                 may be elsewhere on the card when the grid lands. */
            }
            <View
              style={styles.barRow}
              accessibilityLiveRegion="polite"
              accessibilityLabel={busy ? busyLabel : ''}
            >
              {busy
                ? (
                  <ProgressBar
                    indeterminate
                    color={theme.colors.ui.accent}
                    style={styles.bar}
                  />
                )
                : null}
            </View>
          </View>
        )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
  // Laid over the foot of the map, spanning it exactly. Positioned and
  // not stacked, so it takes no height and the legend and sentences
  // under the map do not move as it comes and goes.
  barRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    justifyContent: 'center',
  },
  bar: { height: 3 },
});
