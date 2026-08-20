import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import {
  bandOf,
  CHIP_GAP,
  CHIP_WIDTH,
  COPIES,
  LEN,
  MAX_STRIP_WIDTH,
  MIDDLE,
  stepsTo,
  STRIDE,
  stridesTo,
  wrap,
} from '../data/bandStrip';
import { BAND_ORDER } from '../data/types';
import type { BandKey } from '../data/types';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import StationStrip from './StationStrip';

interface Props {
  value: BandKey;
  onChange: (band: BandKey) => void;
  /** Opens the station settings. Given by the screen that owns the modal. */
  onEditStation: () => void;
  /** The threshold the forecast on screen was computed at. */
  requiredSnrDb: number;
}

/** Where the strip sits when `band` is centred, in the middle copy. */
const offsetOf = (band: number): number => stridesTo(band) * STRIDE;

/** Which band of the list a resting position has come to, whatever copy. */
const bandAt = (x: number): number => bandOf(Math.round(x / STRIDE));
/**
 * The band every module on the screen is showing.
 *
 * Drives the map, the window rail's tick and the grid row. No "best
 * band" option: the grid shows every band at once, so an automatic pick
 * would only hide which one it chose.
 *
 * A picker, not a row of chips — the bands are wider than a phone, and a
 * row cut the last one in half, which reads as the list ending. So the
 * strip has no ends: 10m is followed by 160m. Capped at
 * `MAX_STRIP_WIDTH`, since endless only holds while no band is on screen
 * twice, and a browser window is wide enough to break that.
 *
 * The frame is not decoration. Coming to rest chooses a band, so the rule
 * has to be visible (user, 2026-08-18: "you don't have to manually click
 * on the band for it to switch"). Whatever is in the frame is what you
 * get. A tap still works, and is what a screen reader and a keyboard use.
 *
 * Designations are not translated: 20m is 20m everywhere.
 */
export default function BandSelector(
  { value, onChange, onEditStation, requiredSnrDb }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const strip = useRef<ScrollView>(null);
  // Sets the end padding, so a band at either end can reach the middle.
  // Zero until the first layout; the effect below then places the strip.
  const [width, setWidth] = useState(0);
  const index = Math.max(0, BAND_ORDER.indexOf(value));

  // Which band is under the frame. The scroll position cannot say it:
  // every copy sits at a different offset and they all look alike.
  const shown = useRef(index);
  const placed = useRef(false);

  // Follows the value, not the touch: a tap here, the map's band change
  // and a forecast restored on launch all land in the right place.
  useEffect(() => {
    if (width === 0) return;

    // First placing is a jump. Sliding in from the left edge would look
    // like the strip was already in use.
    if (!placed.current) {
      placed.current = true;
      shown.current = index;
      strip.current?.scrollTo({ x: offsetOf(index), animated: false });
      return;
    }

    // Go the way the strip looks, not the way the list is written: 160m
    // and 10m are neighbours under the frame, so one place, not nine
    // back through the list (user, 2026-08-18). The move ends in the
    // middle copy, so jump first, unanimated, to the copy `steps` away
    // from it — same band, same neighbours, nothing to see — and the
    // slide that follows is the short one.
    const steps = stepsTo(shown.current, index);
    shown.current = index;
    if (steps !== 0) {
      strip.current?.scrollTo({
        x: offsetOf(index) - steps * STRIDE,
        animated: false,
      });
    }
    strip.current?.scrollTo({ x: offsetOf(index), animated: true });
  }, [index, width]);

  const settled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const band = bandAt(e.nativeEvent.contentOffset.x);
    shown.current = band;
    // Back to the middle copy, unanimated, so there is always a copy to
    // run into whichever way the next swipe goes. Same band, same
    // neighbours: nothing moves on screen.
    strip.current?.scrollTo({ x: offsetOf(band), animated: false });
    // Only on a change: otherwise the scroll above reports the band it
    // was already showing and every selection is made twice.
    if (BAND_ORDER[band] !== value) onChange(BAND_ORDER[band] as BandKey);
  };

  const measure = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  // Half the strip either side, less half a chip, so an end band can
  // still sit in the middle. Never negative on a very narrow screen.
  const edge = Math.max(0, (width - CHIP_WIDTH) / 2);

  return (
    <View style={styles.wrap}>
      {
        /* Its own line: sharing one put "Band" over the station's icons,
           where it read as their heading. */
      }
      <View style={styles.stationRow}>
        <StationStrip
          onPress={onEditStation}
          requiredSnrDb={requiredSnrDb}
        />
      </View>
      {
        /* `text3`, not `text4`: on the darker header since 2026-08-01
           the lightest role measures 2.81, under the 3 large text needs.
           `contrast.test.ts` fails on it. */
      }
      <Text style={[typography.label, styles.label, { color: ui.text3 }]}>
        {t('bands.label')}
      </Text>

      <View style={styles.stripRow}>
        {
          /* Drawn before the strip so the bands pass over it, and deaf to
             touch so it cannot take a tap meant for a band. */
        }
        <View
          pointerEvents="none"
          style={[styles.slot, {
            left: edge - SLOT_BLEED,
            borderColor: ui.accent,
          }]}
        />
        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={measure}
          // One band a step, resting centred. Momentum stays on: a strip
          // with no ends is worth flinging, and an overshoot past the
          // copies is put right when it settles.
          snapToInterval={STRIDE}
          snapToAlignment="start"
          decelerationRate="fast"
          onMomentumScrollEnd={settled}
          contentContainerStyle={[styles.row, { paddingHorizontal: edge }]}
        >
          {Array.from({ length: COPIES * LEN }, (_, at) => {
            const band = BAND_ORDER[wrap(at, LEN)] as BandKey;
            const selected = value === band;
            // One copy only for a screen reader: five readings of the
            // same short list would make it unusable.
            const copy = Math.floor(at / LEN);
            const spoken = copy === MIDDLE;
            return (
              <TouchableRipple
                // Copy and band: the same band appears once per copy.
                key={`${copy}-${band}`}
                onPress={() => onChange(band)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('a11y.pinBand', { band })}
                // Where this band sits in the list. A strip with no ends
                // hides that from anyone who cannot see it move.
                accessibilityHint={t('a11y.bandPosition', {
                  at: wrap(at, LEN) + 1,
                  of: LEN,
                })}
                // `aria-hidden` rather than the iOS and Android props it
                // stands for: React Native maps it to both, and
                // react-native-web ignores those, so the web build
                // offered the same band five times. Out of the tab order
                // to match.
                aria-hidden={!spoken}
                focusable={spoken}
                style={[styles.chip, {
                  backgroundColor: selected ? ui.accent : ui.card,
                  borderColor: selected ? ui.accent : ui.line,
                }]}
              >
                <Text
                  style={[typography.bodyStrong, numeric, {
                    color: selected ? ui.accentInk : ui.text2,
                  }]}
                >
                  {band}
                </Text>
              </TouchableRipple>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

/** How far the frame stands outside the chip it holds, each side. */
const SLOT_BLEED = 4;

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  label: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  // Centred, never past one list wide: beyond that a band shows twice.
  // The cap belongs here and not on the scroll view, because the frame
  // sits inside this box and measures against its width.
  stripRow: {
    justifyContent: 'center',
    maxWidth: MAX_STRIP_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },
  slot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: CHIP_WIDTH + SLOT_BLEED * 2,
    borderRadius: radius.inset + SLOT_BLEED,
    borderWidth: 2,
  },
  // The horizontal padding is worked out from the strip's width, so it
  // is set on the element rather than here.
  row: { gap: CHIP_GAP, alignItems: 'center', paddingVertical: SLOT_BLEED },
  chip: {
    // Fixed, not a minimum: the stride is width plus gap, so a chip
    // sized to its text would drift out of step down the list.
    width: CHIP_WIDTH,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
