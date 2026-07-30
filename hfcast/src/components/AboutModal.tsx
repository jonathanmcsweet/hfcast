import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
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

export default function AboutModal({ visible, onDismiss }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const [openLicence, setOpenLicence] = useState<string | null>(null);

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
          <Text style={[typography.caption, styles.para, { color: ui.text3 }]}>
            {t('about.version', {
              version: `${APP_VERSION} (${APP_VERSION_CODE})`,
            })}
          </Text>

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
