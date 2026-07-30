import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Divider, IconButton, Menu, Text, useTheme } from 'react-native-paper';
import { UNIT_PREFERENCES } from '../data/units';
import type { UnitPreference } from '../data/units';
import { useDirection } from '../hooks/useDirection';
import { useUnits } from '../hooks/useUnits';
import { LANGUAGE_NAMES, SUPPORTED } from '../i18n';
import type { SupportedLanguage } from '../i18n';
import { THEME_MODES, useSettingsStore } from '../store/useSettingsStore';
import type { ThemeMode } from '../store/useSettingsStore';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import AboutModal from './AboutModal';
import ServerAddressDialog from './ServerAddressDialog';

/** The icon each mode shows, so a glance says which one is in force. */
const THEME_ICONS: Record<ThemeMode, string> = {
  system: 'theme-light-dark',
  light: 'white-balance-sunny',
  dark: 'weather-night',
};

const UNIT_ICONS: Record<UnitPreference, string> = {
  auto: 'cellphone-cog',
  metric: 'ruler',
  imperial: 'ruler-square',
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
 * submenu costs a second tap to see three words. The station is the
 * exception and opens a modal: it has three settings with ranges rather
 * than a list to pick from, and it is the one thing here that changes the
 * numbers rather than the presentation.
 */
interface Props {
  /** Opens the station settings, which live in a modal of their own. */
  onOpenStation: () => void;
}

export default function SettingsMenu({ onOpenStation }: Props) {
  const [serverOpen, setServerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const theme = useTheme<AppTheme>();
  const { i18n, t } = useTranslation();
  const { setLanguage } = useDirection();
  const mode = useSettingsStore((s) => s.themeMode);
  const setMode = useSettingsStore((s) => s.setThemeMode);
  const units = useSettingsStore((s) => s.units);
  const setUnits = useSettingsStore((s) => s.setUnits);
  const resolved = useUnits();
  const ui = theme.colors.ui;

  const heading = (text: string) => (
    <View style={styles.heading}>
      <Text style={[typography.label, { color: ui.text4 }]}>{text}</Text>
    </View>
  );

  return (
    <>
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
        {
          /* First, and above the display settings, because it is the only
           item here that changes what the forecast says rather than how
           it looks. */
        }
        {heading(t('settings.stationSection'))}
        <Menu.Item
          title={t('station.title')}
          leadingIcon="radio"
          onPress={() => {
            setOpen(false);
            onOpenStation();
          }}
        />
        {
          /* Here as well as on the error screen. Once a forecast is on screen
           the address is working, so this is for moving between a laptop at
           home and a tunnel elsewhere. */
        }
        <Menu.Item
          title={t('server.title')}
          leadingIcon="server-network"
          onPress={() => {
            setOpen(false);
            setServerOpen(true);
          }}
        />

        <Divider />

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

        {
          /* "Follow the device" names what it resolved to, because a reader
           checking this menu is usually checking whether it got it right. */
        }
        {heading(t('settings.unitsSection'))}
        {UNIT_PREFERENCES.map((value) => (
          <Menu.Item
            key={value}
            title={value === 'auto'
              ? t('settings.units.autoNamed', {
                system: t(`settings.units.${resolved.system}`),
              })
              : t(`settings.units.${value}`)}
            leadingIcon={units === value ? 'check' : UNIT_ICONS[value]}
            onPress={() => {
              setOpen(false);
              setUnits(value);
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

        <Divider />

        {
          /* Last, because nobody comes here for it — and present because the
             font's licence requires its text to travel with the app, and
             NTIA/ITS asks that VOACAP be credited. */
        }
        <Menu.Item
          title={t('about.title')}
          leadingIcon="information-outline"
          onPress={() => {
            setOpen(false);
            setAboutOpen(true);
          }}
        />
      </Menu>
      <ServerAddressDialog
        visible={serverOpen}
        onDismiss={() => setServerOpen(false)}
      />
      <AboutModal visible={aboutOpen} onDismiss={() => setAboutOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
});
