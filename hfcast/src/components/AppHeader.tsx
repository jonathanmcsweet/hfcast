import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  IconButton,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import LocalePicker from './LocalePicker';

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
          <Text style={[typography.captionStrong, { color: ui.accent }]}>
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
            <Text style={[typography.label, { color: ui.text3 }]}>
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
      <LocalePicker />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginStart: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
});
