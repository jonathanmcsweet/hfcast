import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { UNIT_PREFERENCES } from '../data/units';
import { useDirection } from '../hooks/useDirection';
import { useUnits } from '../hooks/useUnits';
import { LANGUAGE_NAMES, SUPPORTED } from '../i18n';
import type { SupportedLanguage } from '../i18n';
import { ENGINE_MODELS, useSettingsStore } from '../store/useSettingsStore';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import ChipGroup from './ChipGroup';

/**
 * Language and units, out of the menu (user, 2026-08-11).
 *
 * They were two lists inside the settings menu, and the menu was long
 * before a third English was added. Ten of its items were a language or
 * a unit — settings a person picks once and then never opens again —
 * sitting above the ones they came for.
 *
 * Chips rather than menu rows, because both lists are a single choice
 * out of a short set, which is what a chip row says and what a stack of
 * ticked rows only implies. Seven languages wrap onto three lines here
 * and would have been seven more rows there.
 *
 * The theme stays in the menu. It is the one presentation setting that
 * is changed for a reason that arrives suddenly — the sun goes down, or
 * the room does — and one tap is worth more than tidiness there.
 */

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function PreferencesModal({ visible, onDismiss }: Props) {
  const theme = useTheme<AppTheme>();
  const { i18n, t } = useTranslation();
  const { setLanguage } = useDirection();
  const units = useSettingsStore((s) => s.units);
  const setUnits = useSettingsStore((s) => s.setUnits);
  const engineModel = useSettingsStore((s) => s.engineModel);
  const setEngineModel = useSettingsStore((s) => s.setEngineModel);
  const resolved = useUnits();
  const ui = theme.colors.ui;

  const heading = (text: string) => (
    <Text style={[typography.label, styles.heading, { color: ui.text4 }]}>
      {text}
    </Text>
  );

  /**
   * "Follow the device" names what it resolved to, because a reader
   * opening this is usually checking whether it got it right.
   */
  const unitLabel = (value: (typeof UNIT_PREFERENCES)[number]) =>
    value === 'auto'
      ? t('settings.units.autoNamed', {
        system: t(`settings.units.${resolved.system}`),
      })
      : t(`settings.units.${value}`);

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
            {t('preferences.title')}
          </Text>
          <IconButton
            icon="close"
            onPress={onDismiss}
            accessibilityLabel={t('preferences.close')}
            iconColor={ui.text2}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {heading(t('settings.languageSection'))}
          {
            /* Each language names itself, so somebody who cannot read the
               current one can still find their own. The three Englishes
               carry their country for the same reason: "English" three
               times says nothing about which to pick. */
          }
          <ChipGroup
            options={SUPPORTED}
            selected={i18n.language as SupportedLanguage}
            onSelect={(lang) => void setLanguage(lang)}
            label={(lang) => LANGUAGE_NAMES[lang]}
            a11yLabel={(lang) => LANGUAGE_NAMES[lang]}
          />

          {heading(t('settings.unitsSection'))}
          <ChipGroup
            options={UNIT_PREFERENCES}
            selected={units}
            onSelect={setUnits}
            label={unitLabel}
            a11yLabel={unitLabel}
          />

          {heading(t('settings.engineSection'))}
          <ChipGroup
            options={ENGINE_MODELS}
            selected={engineModel}
            onSelect={setEngineModel}
            label={(model) => t(`settings.engine.${model}`)}
            a11yLabel={(model) => t(`settings.engine.${model}`)}
          />
          {
            /* One sentence of what the choice means, because the two chip
               names alone cannot say why the numbers just moved. */
          }
          <Text
            style={[typography.caption, styles.caption, { color: ui.text3 }]}
          >
            {t('settings.engine.caption')}
          </Text>
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
  heading: { marginTop: spacing.lg, marginBottom: spacing.sm },
  caption: { marginTop: spacing.sm },
});
