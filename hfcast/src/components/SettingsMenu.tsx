import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Divider, IconButton, Menu, Text, useTheme } from 'react-native-paper';
import { useDirection } from '../hooks/useDirection';
import { LANGUAGE_NAMES, SUPPORTED } from '../i18n';
import type { SupportedLanguage } from '../i18n';
import { THEME_MODES, useSettingsStore } from '../store/useSettingsStore';
import type { ThemeMode } from '../store/useSettingsStore';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/** The icon each mode shows, so a glance says which one is in force. */
const THEME_ICONS: Record<ThemeMode, string> = {
  system: 'theme-light-dark',
  light: 'white-balance-sunny',
  dark: 'weather-night',
};

/**
 * Everything about how the app is shown, behind one control.
 *
 * Theme and language were two icons in the header, competing for width with
 * the place name — which is the one thing at the top that has to be
 * readable, and the one thing that can be arbitrarily long. Neither setting
 * is touched often enough to earn a permanent slot.
 *
 * One flat menu rather than nested ones: both lists are short, and a
 * submenu costs a second tap to see three words.
 */
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const theme = useTheme<AppTheme>();
  const { i18n, t } = useTranslation();
  const { setLanguage } = useDirection();
  const mode = useSettingsStore((s) => s.themeMode);
  const setMode = useSettingsStore((s) => s.setThemeMode);
  const ui = theme.colors.ui;

  const heading = (text: string) => (
    <View style={styles.heading}>
      <Text style={[typography.label, { color: ui.text4 }]}>{text}</Text>
    </View>
  );

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <IconButton
          icon="dots-vertical"
          size={20}
          onPress={() => setOpen(true)}
          accessibilityLabel={t('settings.menu')}
          iconColor={ui.text2}
        />
      }
    >
      {heading(t('settings.themeSection'))}
      {THEME_MODES.map((value) => (
        <Menu.Item
          key={value}
          title={t(`settings.theme.${value}`)}
          leadingIcon={mode === value ? 'check' : THEME_ICONS[value]}
          onPress={() => {
            setOpen(false);
            setMode(value);
          }}
        />
      ))}

      <Divider />

      {heading(t('settings.languageSection'))}
      {SUPPORTED.map((lang) => (
        <Menu.Item
          key={lang}
          title={LANGUAGE_NAMES[lang]}
          leadingIcon={i18n.language === lang ? 'check' : undefined}
          onPress={() => {
            setOpen(false);
            void setLanguage(lang as SupportedLanguage);
          }}
        />
      ))}
    </Menu>
  );
}

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
});
