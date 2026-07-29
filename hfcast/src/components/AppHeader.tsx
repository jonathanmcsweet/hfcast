import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  IconButton,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { face, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import SettingsMenu from './SettingsMenu';

interface Props {
  /** Where the operator is. Every forecast is worked out from here. */
  place: string;
  /** Shown only when a fetch failed and saved data is on screen. */
  offline: boolean;
  onPressPlace: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

/**
 * The screen's own header, scrolling with the content rather than pinned.
 *
 * No wordmark. The user knows which app they opened; the one thing they need
 * at the top is where the forecast is being worked out from, because every
 * number below depends on it.
 */
export default function AppHeader({
  place,
  offline,
  onPressPlace,
  onRefresh,
  refreshing,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  return (
    <View style={styles.row}>
      <TouchableRipple
        onPress={onPressPlace}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.changeLocation', { place })}
        style={styles.place}
      >
        <View style={styles.placeRow}>
          <Text
            numberOfLines={1}
            style={[typography.locationName, styles.placeName, {
              color: ui.ink,
            }]}
          >
            {place}
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

      <IconButton
        icon="refresh"
        size={20}
        disabled={refreshing}
        onPress={onRefresh}
        accessibilityLabel={t('status.retry')}
        iconColor={ui.text2}
      />
      <SettingsMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 2,
  },
  // The whole block opens the location pane, so it is sized as a touch
  // target rather than around its text.
  place: {
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
    marginStart: 'auto',
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
