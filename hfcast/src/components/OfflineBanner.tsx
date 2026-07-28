import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { useFormatters } from '../hooks/useFormatters';
import type { AppTheme } from '../theme';

/**
 * Shown when a fetch failed but a saved forecast exists.
 *
 * The saved forecast is not a degraded substitute: a prediction is
 * monthly climatology, so one saved earlier is as correct today as one
 * fetched now. What the banner has to convey is the one thing that did
 * decay — a now-cast's live readings — and when the data was saved, so
 * the user can judge that for themselves.
 */
export default function OfflineBanner({
  savedAt,
  wasNowcast,
  onRetry,
  retrying,
}: {
  /** When the shown forecast was last fetched successfully. */
  savedAt: number;
  /** The saved forecast was driven by live readings that are now old. */
  wasNowcast: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  const saved = f.dayAndTime(new Date(savedAt));
  const body = t('offline.body', { time: saved });
  const note = wasNowcast ? t('offline.nowcastStale') : t('offline.unchanged');

  // `accessibilityLiveRegion` covers TalkBack. VoiceOver does not act on
  // it, so the announcement is also made explicitly. Both are needed for
  // the banner to reach a screen reader on either platform.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `${t('offline.title')}. ${body} ${note}`,
    );
  }, [t, body, note]);

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surfaceVariant,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.text}>
        <Text
          variant="titleSmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {t('offline.title')}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {body}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {note}
        </Text>
      </View>
      {
        /* Wraps under the text on a narrow screen and sits beside it on a
          wide one, so the button never squeezes the message. */
      }
      <Button
        mode="outlined"
        compact
        loading={retrying}
        disabled={retrying}
        onPress={onRetry}
        style={styles.retry}
      >
        {t('status.retry')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flexGrow: 1, flexShrink: 1, flexBasis: 220, gap: 2 },
  retry: { flexShrink: 0 },
});
