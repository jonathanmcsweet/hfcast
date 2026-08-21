import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import {
  useDraftField,
  useDraftPresets,
  useStationDraftStore,
} from '../../store/useStationDraftStore';
import { spacing, typography } from '../../theme';
import type { AppTheme } from '../../theme';
import Dropdown from '../Dropdown';
import SectionHeading from './SectionHeading';

/**
 * Which station is being edited.
 *
 * The dialog could only edit the active one, so changing a saved station
 * meant closing it, picking that station from the main screen's menu and
 * opening it again.
 *
 * Adding is the last row of the list rather than a button beside it,
 * which is where Android puts it: Wi-Fi networks, Gmail accounts,
 * keyboards. It keeps every control of this section inside the two
 * fields.
 */
export default function StationPicker() {
  const { t } = useTranslation();
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;
  const presets = useDraftPresets();
  const activeId = useDraftField((preset) => preset.id);
  const selectStation = useStationDraftStore((s) => s.selectStation);
  const addStation = useStationDraftStore((s) => s.addStation);

  const unnamed = t('station.unnamed');

  return (
    <>
      <SectionHeading text={t('station.pickSection')} />
      <Dropdown
        label={t('station.a11y.pickStation')}
        selected={activeId}
        onSelect={selectStation}
        options={presets.map((preset) => ({
          key: preset.id,
          label: preset.name === '' ? unnamed : preset.name,
        }))}
        extra={(close) => (
          <Pressable
            onPress={() => {
              addStation();
              close();
            }}
            accessibilityRole="button"
            accessibilityHint={t('station.a11y.addHint')}
            style={styles.add}
          >
            <Icon source="plus" size={18} color={ui.accent} />
            <Text style={[typography.body, { color: ui.accent }]}>
              {t('station.add')}
            </Text>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
});
