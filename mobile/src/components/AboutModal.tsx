import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Divider,
  IconButton,
  Modal,
  Portal,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { CREDITS, DISCLAIMER, LICENCES } from '../data/credits';
import { APP_VERSION, APP_VERSION_CODE } from '../data/version';
import { useSettingsStore } from '../store/useSettingsStore';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * Who made what this is built from, and the licences that travel with it.
 *
 * Not an optional courtesy screen. IBM Plex ships under the SIL Open Font
 * License, which requires its notice and text to accompany the font wherever it
 * goes, and the font is inside the APK. NTIA/ITS asks that VOACAP be credited
 * and that nothing imply a US Government endorsement. Distributing the app
 * without this would be distributing it out of compliance.
 *
 * The licence texts are collapsed by default because nobody opens this to read
 * Apache-2.0 in full — but they are here, in full, which is what the obligation
 * is about.
 */

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/** How many taps on the version reveal the tools for measuring. */
const TAPS_TO_REVEAL = 3;

/**
 * How long a tap counts towards the next one.
 *
 * Long enough to be an unhurried three taps, short enough that taps
 * minutes apart while reading this screen never add up to them.
 */
const TAP_WINDOW_MS = 3000;

/**
 * One address, shown and openable.
 *
 * `Linking.openURL` rejects when nothing on the device handles the scheme,
 * which is an ordinary state on a stripped-down tablet rather than a fault —
 * so the failure is swallowed and the address stays on screen, where it is
 * still a complete attribution.
 */
function Link(
  { url, label, colour }: { url: string; label: string; colour: string; },
) {
  return (
    <TouchableRipple
      onPress={() => {
        void Linking.openURL(url).catch(() => {});
      }}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.link}
    >
      <Text style={[typography.caption, { color: colour }]}>{url}</Text>
    </TouchableRipple>
  );
}

export default function AboutModal({ visible, onDismiss }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const [openLicence, setOpenLicence] = useState<string | null>(null);

  const developer = useSettingsStore((s) => s.developer);
  const setDeveloper = useSettingsStore((s) => s.setDeveloper);
  const taps = useRef(0);
  const lastTap = useRef(0);

  /**
   * Shows or hides the tools for measuring this device.
   *
   * Three taps, and they have to be close together: taps spread over a
   * minute of reading the licences are somebody scrolling, not somebody
   * asking for this. The count starts again after a pause, so a stray
   * tap now and another later never add up to the third.
   *
   * It toggles rather than only turning on, so anybody who finds it by
   * accident can put it back the same way they got there. What happens
   * is spoken as well as shown, because the thing that changed is a row
   * in a menu on another screen.
   */
  const tapVersion = () => {
    const now = Date.now();
    taps.current = now - lastTap.current > TAP_WINDOW_MS ? 1 : taps.current + 1;
    lastTap.current = now;
    if (taps.current < TAPS_TO_REVEAL) return;
    taps.current = 0;
    const turningOn = !developer;
    setDeveloper(turningOn);
    AccessibilityInfo.announceForAccessibility(
      t(turningOn ? 'about.developerOn' : 'about.developerOff'),
    );
  };

  const heading = (text: string) => (
    <Text style={[typography.label, styles.heading, { color: ui.text4 }]}>
      {text}
    </Text>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={styles.headerRow}>
          <Text
            style={[typography.cardHeadline, styles.title, { color: ui.ink }]}
          >
            {t('about.title')}
          </Text>
          <IconButton
            icon="close"
            onPress={onDismiss}
            accessibilityLabel={t('about.close')}
            iconColor={ui.text2}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[typography.body, styles.para, { color: ui.text2 }]}>
            {t('about.what')}
          </Text>
          {
            /* The build number goes next to the version because two APKs carry
               the same version name and differ only in how old a device they
               install on. It is the one thing that tells them apart, and it is
               a number, so it needs no translation. */
          }
          {
            /* Three taps here show or hide the tools for measuring this
               device (user, 2026-08-11). Hidden rather than removed
               because the numbers are worth having from the build that
               ships, and somebody sending them in needs a way to reach
               them — but a benchmark that runs the engine flat out for
               half a minute does not belong in front of a reader who
               came to change the theme.

               On the version line because that is where this idiom
               lives on Android, and because it is already the line a
               person is asked to read out when reporting anything. */
          }
          <TouchableRipple
            onPress={tapVersion}
            accessibilityRole="button"
            accessibilityLabel={t('about.version', {
              version: `${APP_VERSION} (${APP_VERSION_CODE})`,
            })}
            accessibilityHint={t('about.developerHint')}
          >
            <Text
              style={[typography.caption, styles.para, { color: ui.text3 }]}
            >
              {t('about.version', {
                version: `${APP_VERSION} (${APP_VERSION_CODE})`,
              })}
            </Text>
          </TouchableRipple>

          {heading(t('about.builtOn'))}
          {CREDITS.map((credit) => (
            <View key={credit.id} style={styles.credit}>
              <Text style={[typography.bodyStrong, { color: ui.ink }]}>
                {t(`about.credit.${credit.id}`)}
              </Text>
              <Text style={[typography.caption, { color: ui.text2 }]}>
                {credit.who}
              </Text>
              <Text style={[typography.caption, { color: ui.text3 }]}>
                {credit.terms}
              </Text>
              {
                /* The address is shown as well as opened. A reader with no
                   browser handler, or reading a screenshot, still has the
                   whole attribution in front of them — which is the part
                   CC BY 4.0 asks for by name. */
              }
              <Link
                url={credit.url}
                label={t('about.openSource', { who: credit.who })}
                colour={ui.accent}
              />
              {credit.termsUrl
                ? (
                  <Link
                    url={credit.termsUrl}
                    label={t('about.openTerms', { terms: credit.terms })}
                    colour={ui.accent}
                  />
                )
                : null}
            </View>
          ))}

          {heading(t('about.disclaimerSection'))}
          {
            /* Left in English in every language. It is a specific body's own
               statement of its position, and translating it here would be this
               app speaking on their behalf. */
          }
          <Text style={[typography.caption, styles.para, { color: ui.text3 }]}>
            {DISCLAIMER}
          </Text>

          {heading(t('about.licencesSection'))}
          {LICENCES.map((licence) => {
            const open = openLicence === licence.name;
            return (
              <View key={licence.name}>
                <TouchableRipple
                  onPress={() => setOpenLicence(open ? null : licence.name)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={styles.licenceRow}
                >
                  <View>
                    <Text style={[typography.bodyStrong, { color: ui.ink }]}>
                      {`${licence.name} ${open ? '▾' : '▸'}`}
                    </Text>
                    <Text style={[typography.caption, { color: ui.text3 }]}>
                      {licence.covers}
                    </Text>
                  </View>
                </TouchableRipple>
                {open
                  ? (
                    <Text
                      style={[styles.licenceText, {
                        color: ui.text2,
                        backgroundColor: ui.inset,
                      }]}
                    >
                      {licence.text}
                    </Text>
                  )
                  : null}
                <Divider />
              </View>
            );
          })}
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: spacing.lg,
    marginVertical: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radius.card,
    maxHeight: '85%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  heading: { marginTop: spacing.lg, marginBottom: spacing.xs },
  para: { marginBottom: spacing.sm },
  credit: { marginBottom: spacing.md },
  // A 44px row would space the credits out to nothing readable, so the
  // target is the text plus its padding. Every address here sits in a list
  // of them rather than beside anything else tappable.
  link: { paddingVertical: 4, alignSelf: 'flex-start' },
  licenceRow: { paddingVertical: spacing.sm, minHeight: 44 },
  // Monospaced so the licence texts keep the shape they were written in.
  licenceText: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 15,
    padding: spacing.sm,
    borderRadius: radius.inset,
    marginBottom: spacing.sm,
  },
});
