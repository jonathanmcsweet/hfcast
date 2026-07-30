import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { useFormatters } from '../hooks/useFormatters';
import { face, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import SettingsMenu from './SettingsMenu';

/**
 * A single hop reaches about this far. Used only to say how many bounces the
 * signal makes, which is the honest way to explain why a long path is harder
 * than a short one: every bounce off the ground loses signal.
 */
const HOP_KM = 3400;

export interface HeaderDestination {
  label: string;
  distanceKm: number;
  bearingDeg: number;
}

interface Props {
  /** Where the operator is. Every forecast is worked out from here. */
  place: string;
  /**
   * The far end, or null when none is set. Null is an ordinary state: the
   * map answers who can hear you without one.
   */
  destination: HeaderDestination | null;
  /** Shown only when a fetch failed and saved data is on screen. */
  offline: boolean;
  /** Opens the location pane, which chooses either end. */
  onPressPlace: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** Opens the station settings from the menu. */
  onOpenStation: () => void;
}

/**
 * The screen's own header, scrolling with the content rather than pinned.
 *
 * No wordmark. The user knows which app they opened; what they need at the top
 * is the path being forecast, because every number below depends on it. This
 * used to be the operator's location alone, with the path summary far below
 * between the map and the grid — so the first thing on screen named one end of
 * a two-ended question.
 *
 * There is no refresh button. The app polls for new readings on its own, and a
 * manual refresh is in the menu for whoever wants one.
 *
 * There is no Change destination button either. The path name is the control —
 * it carries both ends and its own "Change" affordance, and the pane it opens
 * chooses either end. A second button below it said the same thing twice and
 * took a whole row to do it.
 */
export default function AppHeader({
  place,
  destination,
  offline,
  onPressPlace,
  onRefresh,
  refreshing,
  onOpenStation,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const hops = destination
    ? Math.max(1, Math.ceil(destination.distanceKm / HOP_KM))
    : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableRipple
          onPress={onPressPlace}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.changeLocation', { place })}
          style={styles.place}
        >
          <View style={styles.placeRow}>
            <Text
              numberOfLines={2}
              style={[typography.locationName, styles.placeName, {
                color: ui.ink,
              }]}
            >
              {destination ? `${place} → ${destination.label}` : place}
            </Text>
            {
              /* The affordance is a word, not an icon. "Change" says what
                 happens; a pencil or a chevron has to be learned. */
            }
            <Text style={[styles.change, { color: ui.accent }]}>
              {`${t('location.change')} ▾`}
            </Text>
          </View>
        </TouchableRipple>

        {offline
          ? (
            <View
              accessible
              accessibilityLabel={t('offline.title')}
              style={[styles.chip, {
                backgroundColor: ui.inset,
                borderColor: ui.line2,
              }]}
            >
              <View style={[styles.dot, { borderColor: ui.text3 }]} />
              <Text style={[styles.chipText, { color: ui.text2 }]}>
                {t('offline.chip')}
              </Text>
            </View>
          )
          : null}

        <SettingsMenu
          onOpenStation={onOpenStation}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      </View>

      {
        /* Distance, bearing and hops sit under the path rather than beside
           it: three figures and a two-ended name do not fit one line on a
           phone, and the name is the part that must not be truncated. */
      }
      {destination
        ? (
          <Text style={[typography.caption, { color: ui.text3 }]}>
            {
              // A separate string for one hop rather than a plural rule. Five
              // languages with five different plural systems is a lot of
              // machinery for a number that is only ever 1 or more.
              hops === 1
                ? t('path.summaryOneHop', {
                  distance: f.distance(destination.distanceKm),
                  bearing: f.degrees(destination.bearingDeg),
                })
                : t('path.summary', {
                  distance: f.distance(destination.distanceKm),
                  bearing: f.degrees(destination.bearingDeg),
                  hops,
                })
            }
          </Text>
        )
        : (
          <Text style={[typography.caption, { color: ui.text3 }]}>
            {t('path.noDestinationHint')}
          </Text>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: 2,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The whole block opens the location pane, so it is sized as a touch
  // target rather than around its text.
  //
  // It also takes all the slack in the row. That is what holds the controls
  // against the far edge: without it the row packs to the start and they sit
  // wherever the place name happens to end, which moves as the name changes.
  place: {
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radius.inset,
  },
  // Wraps rather than truncates: a long place name in German costs a line,
  // never a missing word.
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  placeName: { flexShrink: 1 },
  change: { fontSize: 13, lineHeight: 18, fontFamily: face.bold },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // No auto margin: the place block takes the slack now, and a second
    // one here would split the space and push the chip away from the
    // controls it belongs beside.
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The design sets this at 10px. The type scale's floor is 11, because the
  // app is read outdoors, and a warning is the last thing to shrink.
  chipText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: face.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
});
