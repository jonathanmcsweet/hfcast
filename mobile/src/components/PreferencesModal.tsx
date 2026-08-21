import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { UNIT_PREFERENCES } from '../data/units';
import { useDirection } from '../hooks/useDirection';
import { useUnits } from '../hooks/useUnits';
import { LANGUAGE_NAMES, SUPPORTED } from '../i18n';
import type { SupportedLanguage } from '../i18n';
import { ENGINE_MODELS, useSettingsStore } from '../store/useSettingsStore';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import ChipGroup from './ChipGroup';
import Dropdown from './Dropdown';
import ModalFrame from './ModalFrame';

/**
 * Language and units, out of the menu (user, 2026-08-11).
 *
 * Ten of the menu's items were a language or a unit — picked once and
 * never opened again — sitting above the ones people came for.
 *
 * Chips rather than menu rows: both lists are a single choice out of a
 * short set, which a chip row says and a stack of ticked rows only
 * implies. Seven languages wrap onto three lines here.
 *
 * The theme stays in the menu, being the one presentation setting changed
 * for a reason that arrives suddenly — the sun goes down, or the room
 * does — where one tap beats tidiness.
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
    <ModalFrame
      visible={visible}
      onDismiss={onDismiss}
      title={t('preferences.title')}
      leave="back"
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {heading(t('settings.languageSection'))}
        {
          /* A dropdown, not chips: the list only grows, and seven
             already wrap onto three lines. Each language names itself,
             so somebody who cannot read the current one can still find
             their own, and the three Englishes carry their country for
             the same reason. */
        }
        <Dropdown
          label={t('settings.changeLanguage')}
          options={SUPPORTED.map((lang) => ({
            key: lang,
            label: LANGUAGE_NAMES[lang],
          }))}
          selected={i18n.language as SupportedLanguage}
          onSelect={(lang) => void setLanguage(lang)}
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
    </ModalFrame>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: spacing.lg, marginBottom: spacing.sm },
  caption: { marginTop: spacing.sm },
});
