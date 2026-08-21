import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ScrollView, StyleSheet } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';

import { typography } from '../theme';
import type { AppTheme } from '../theme';
import ModalFrame from './ModalFrame';

/**
 * The measurement's numbers, with a way to get them off the phone.
 *
 * This replaced an alert box. An alert can only be read or photographed,
 * and the numbers exist to be sent — a screenshot of them has to be
 * retyped at the other end (user, 2026-08-10). One press on the copy
 * icon puts the same text on the clipboard that the alert used to show,
 * and the text itself is selectable for anyone who wants only a line of
 * it.
 *
 * The icon answers with a tick for a moment rather than a toast: the
 * press happened where the eye already is, and a toast would cover the
 * numbers it refers to. The same word is spoken to a screen reader,
 * which cannot see the tick.
 */
interface Props {
  visible: boolean;
  /** True while the benchmark runs; the numbers are not here yet. */
  measuring: boolean;
  /** What the benchmark measured, or what stopped it. */
  text: string;
  onDismiss: () => void;
}

/** How long the copy icon shows its tick. */
const COPIED_MS = 2000;

export default function MeasureModal(
  { visible, measuring, text, onDismiss }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    AccessibilityInfo.announceForAccessibility(t('settings.copied'));
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <ModalFrame
      visible={visible}
      onDismiss={onDismiss}
      title={t('settings.measure')}
      // While the benchmark runs there is no way out on offer: a tap
      // outside would close the only place its answer can arrive.
      leave={measuring ? 'none' : 'close'}
      tool={measuring ? null : (
        <IconButton
          icon={copied ? 'check' : 'content-copy'}
          onPress={() => {
            void copy();
          }}
          accessibilityLabel={t(
            copied ? 'settings.copied' : 'settings.copyMeasurement',
          )}
          iconColor={copied ? theme.colors.primary : ui.text2}
        />
      )}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {measuring
          ? (
            <Text style={[typography.body, { color: ui.text2 }]}>
              {t('settings.measuring')}
            </Text>
          )
          : (
            <Text selectable style={[styles.numbers, { color: ui.text2 }]}>
              {text}
            </Text>
          )}
      </ScrollView>
    </ModalFrame>
  );
}

const styles = StyleSheet.create({
  // Monospaced so the stage lines keep their shape, and so the text
  // matches the log it will be read next to.
  numbers: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
});
