import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { Divider, IconButton, Menu, Text, useTheme } from 'react-native-paper';
import * as Engine from '../../modules/engine-bridge';
import { type BenchmarkResult, runBenchmark } from '../data/benchmark';
import { setDiagnostics } from '../data/diagnostics';
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
import HelpModal from './HelpModal';

/** The icon each mode shows, so a glance says which one is in force. */
const THEME_ICONS: Record<ThemeMode, string> = {
  system: 'theme-light-dark',
  light: 'white-balance-sunny',
  dark: 'weather-night',
  // An owl. The set has no possum and no raccoon — both were asked for
  // (user, 2026-08-01) and neither exists in Material Community Icons —
  // and of what is there, the owl is the one that reads as nocturnal at
  // 24 points rather than as a rodent.
  lowLight: 'owl',
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
  /** Asks for new readings now rather than at the next poll. */
  onRefresh: () => void;
  /** True while a fetch is in flight, so the item cannot be pressed twice. */
  refreshing: boolean;
}

export default function SettingsMenu(
  { onOpenStation, onRefresh, refreshing }: Props,
) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const theme = useTheme<AppTheme>();
  const { i18n, t } = useTranslation();
  const { setLanguage } = useDirection();
  const mode = useSettingsStore((s) => s.themeMode);
  const setMode = useSettingsStore((s) => s.setThemeMode);
  const units = useSettingsStore((s) => s.units);
  const setUnits = useSettingsStore((s) => s.setUnits);
  const resolved = useUnits();
  const [measuring, setMeasuring] = useState(false);
  const ui = theme.colors.ui;

  /**
   * Runs the benchmark and puts its numbers where they can be read.
   *
   * Two places, because they answer to different people. The Android log
   * gets the whole path under the `hfcast` tag, including the two stages
   * JavaScript cannot see — what the Rust spent computing, and what the
   * boundary spent turning a 2.9 MB answer into a Java string. The
   * dialog gets a summary, so somebody holding the phone can read the
   * result without a cable.
   */
  const measure = async () => {
    setMeasuring(true);
    setDiagnostics(true);
    try {
      Alert.alert(t('settings.measure'), t('settings.measuring'));
      const result = await runBenchmark();
      Alert.alert(t('settings.measure'), summarise(result));
    } catch (e) {
      Alert.alert(
        t('settings.measure'),
        `${t('settings.measureFailed')}\n\n${String(e)}`,
      );
    } finally {
      setDiagnostics(null);
      setMeasuring(false);
    }
  };

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
          /* The app polls for new readings on its own, so this is here for
             whoever wants to ask now rather than wait — which is why it is in
             a menu and no longer a button in the header competing with the
             place name. */
        }
        <Menu.Item
          title={t('settings.refresh')}
          leadingIcon="refresh"
          disabled={refreshing}
          onPress={() => {
            setOpen(false);
            onRefresh();
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
            {
              // Spread rather than passed as undefined: Paper's own prop is
              // optional and not nullable, and an unticked language has no
              // icon rather than an absent one.
              ...(i18n.language === lang ? { leadingIcon: 'check' } : {})
            }
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
        {
          /* Above About, because it is about the forecast rather than
             about the app: it holds the places where the answer rests on
             a decision this project made rather than on a reading. */
        }
        <Menu.Item
          title={t('help.title')}
          leadingIcon="help-circle-outline"
          onPress={() => {
            setOpen(false);
            setHelpOpen(true);
          }}
        />
        <Menu.Item
          title={t('about.title')}
          leadingIcon="information-outline"
          onPress={() => {
            setOpen(false);
            setAboutOpen(true);
          }}
        />

        {
          /* Only where there is an engine to measure. The web build
             reaches the server for everything and has nothing here that
             a browser's own tools would not show better. */
        }
        {Engine.isAvailable()
          ? (
            <>
              <Divider />
              {heading(t('settings.diagnosticsSection'))}
              <Menu.Item
                title={t('settings.measure')}
                leadingIcon="timer-outline"
                disabled={measuring}
                onPress={() => {
                  setOpen(false);
                  void measure();
                }}
              />
            </>
          )
          : null}
      </Menu>
      <HelpModal visible={helpOpen} onDismiss={() => setHelpOpen(false)} />
      <AboutModal visible={aboutOpen} onDismiss={() => setAboutOpen(false)} />
    </>
  );
}

/**
 * The benchmark's numbers as a few lines somebody can read or photograph.
 *
 * Deliberately not translated. It is a measurement, not a message: the
 * stage names match what the log writes, so a screenshot and a log can
 * be lined up against each other.
 */
function summarise(result: BenchmarkResult): string {
  const lines = result.stages.map((each) =>
    `${each.what}\n  ${each.points} points, engine ${each.nativeMs} ms, `
    + `parse ${each.parseMs} ms, total ${each.totalMs} ms`
  );
  return [
    `${result.cores} cores, ${result.threads} threads`,
    ...lines,
  ].join('\n');
}

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
});
