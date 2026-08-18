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
  COPIES,
  LEN,
  MIDDLE,
  stepsTo,
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

/**
 * How wide one band sits, and how far apart two of them are.
 *
 * Fixed rather than measured, because the snap has to know the stride
 * before anything is drawn. Wide enough for `160m`, which is the longest
 * designation, at the strong body face.
 */
const CHIP_WIDTH = 64;
const CHIP_GAP = spacing.sm;
const STRIDE = CHIP_WIDTH + CHIP_GAP;

/** Where the strip sits when `band` is centred, in the middle copy. */
const offsetOf = (band: number): number => stridesTo(band) * STRIDE;

/** Which band of the list a resting position has come to, whatever copy. */
const bandAt = (x: number): number => bandOf(Math.round(x / STRIDE));
/**
 * The band every module on the screen is showing.
 *
 * One selector drives the whole screen: choosing a band recolours the map,
 * moves the window rail's tick and highlights the grid row. There is no
 * "best band" option — the grid shows every band at once, so an automatic
 * pick would only hide which band it chose.
 *
 * A picker rather than a row of chips. Nine bands are wider than a phone,
 * and a plain row left the band at the right edge cut in half, which reads
 * as though the list ends there. So the strip holds the chosen band in the
 * middle and runs endlessly in both directions: 6m is followed by 160m
 * rather than by a wall.
 *
 * The frame in the middle is not decoration. Coming to rest chooses a
 * band, and a control that changes what the whole screen shows without
 * being pressed has to say where that happens (user, 2026-08-18: "it's not
 * clear how that works to the user since you don't have to manually click
 * on the band for it to switch"). The frame is fixed while the bands move
 * through it, which is the one thing that makes the rule visible: whatever
 * is in the frame is what you get. A tap still works, and is what a screen
 * reader and a keyboard use.
 *
 * Band designations are not translated: 20m is 20m to operators everywhere,
 * the same reason grids and megahertz stay as they are.
 */
export default function BandSelector(
  { value, onChange, onEditStation, requiredSnrDb }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const strip = useRef<ScrollView>(null);
  // The strip's own width, which decides how much empty space the ends
  // need to be able to reach the middle. Zero until the first layout, and
  // then the effect below puts the selection where it belongs.
  const [width, setWidth] = useState(0);
  const index = Math.max(0, BAND_ORDER.indexOf(value));

  // Which band is under the frame now. Kept because the distance to the
  // next one has to be measured from what the reader is looking at, and
  // the scroll position alone cannot say it: every copy of a band sits at
  // a different offset and they all look the same.
  const shown = useRef(index);
  const placed = useRef(false);

  // Follows the value rather than the touch, so the strip lands in the
  // right place whoever moved it: a tap here, the map's own band change,
  // or a forecast restored on launch.
  useEffect(() => {
    if (width === 0) return;

    // The first placing is a jump. Sliding in from the left edge on the
    // first layout would look like the strip was already being used.
    if (!placed.current) {
      placed.current = true;
      shown.current = index;
      strip.current?.scrollTo({ x: offsetOf(index), animated: false });
      return;
    }

    // Go the way the strip looks, not the way the list is written. 160m
    // and 10m sit next to each other under the frame, so tapping one
    // from the other has to move one place, not eight back through the
    // whole list (user, 2026-08-18).
    //
    // The move always ends in the middle copy, so the trick is to start
    // somewhere that makes the short way the direct way: jump, without
    // animation, to the copy that is `steps` away from where the move
    // ends. That jump shows the band already on screen with the same
    // neighbours, so there is nothing to see, and the slide that follows
    // is the short one.
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
    // Back to the middle copy first, and without animation, so there is
    // always a copy to run into whichever way the next swipe goes. The
    // picture does not move: it is the same band with the same
    // neighbours, one copy over.
    strip.current?.scrollTo({ x: offsetOf(band), animated: false });
    // Only when it is a change. Without this the scroll above would
    // report the band it was already showing, and every selection would
    // be made twice.
    if (BAND_ORDER[band] !== value) onChange(BAND_ORDER[band] as BandKey);
  };

  const measure = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  // Half the strip either side, less half a chip, so a band at either end
  // of a copy can still sit in the middle. Never negative: on a screen
  // narrower than one chip the padding simply goes away.
  const edge = Math.max(0, (width - CHIP_WIDTH) / 2);

  return (
    <View style={styles.wrap}>
      {
        /* The station on its own line, above the label rather than beside
           it. Sharing a line put the word "Band" over the station's icons,
           where it read as their heading — and the station already has a
           heading, which is the control itself. */
      }
      <View style={styles.stationRow}>
        <StationStrip
          onPress={onEditStation}
          requiredSnrDb={requiredSnrDb}
        />
      </View>
      {
        /* `text3` and not `text4`. This label sits on the header, which
           is darker than the page since 2026-08-01, and the lightest
           text role fell to 2.81 against it — under the 3 that large
           text needs. `contrast.test.ts` fails on it. */
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
          // One band a step, coming to rest centred rather than wherever
          // the finger left it. Momentum is left on: a strip with no ends
          // is worth flinging, and a fling that overshoots the copies is
          // put right when it settles.
          snapToInterval={STRIDE}
          snapToAlignment="start"
          decelerationRate="fast"
          onMomentumScrollEnd={settled}
          contentContainerStyle={[styles.row, { paddingHorizontal: edge }]}
        >
          {Array.from({ length: COPIES * LEN }, (_, at) => {
            const band = BAND_ORDER[wrap(at, LEN)] as BandKey;
            const selected = value === band;
            // Only one copy is offered to a screen reader. All five are
            // the same nine bands, and reading forty-five buttons would
            // make a short list unusable for the readers a picker is
            // already hardest for.
            const copy = Math.floor(at / LEN);
            const spoken = copy === MIDDLE;
            return (
              <TouchableRipple
                // Which copy and which band, because the same band appears
                // once per copy and neither half identifies it alone.
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
                // react-native-web ignores those two entirely, so the web
                // build offered the same band five times. Kept out of the
                // tab order to match, since a control nothing can name
                // should not be reachable by keyboard either.
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
  stripRow: { justifyContent: 'center' },
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
    // Fixed rather than a minimum: the snap stride is one width plus one
    // gap, so a chip that sized itself to its text would drift out of
    // step with the snap by the end of the list.
    width: CHIP_WIDTH,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
