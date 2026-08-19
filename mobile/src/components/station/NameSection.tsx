import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import {
  useDraftActiveId,
  useDraftField,
  useDraftPresets,
  useStationDraftStore,
} from '../../store/useStationDraftStore';
import { MAX_NAME_LENGTH } from '../../store/useStationStore';
import { spacing } from '../../theme';
import SectionHeading from './SectionHeading';

/**
 * The name of the station being edited, and the buttons that make and
 * remove one.
 *
 * The picker above chooses the station; this renames it. Two controls,
 * because one field that both filtered a list and renamed what it found
 * would act differently depending on what was already in it.
 *
 * A new station arrives named ("Station 2"). It used to arrive empty, and
 * a field showing only its placeholder looks like a form that was never
 * filled in — which is why adding a station read as losing one
 * (user, 2026-08-18).
 */
export default function NameSection() {
  const { t } = useTranslation();
  const name = useDraftField((preset) => preset.name);
  const presets = useDraftPresets();
  const activeId = useDraftActiveId();
  const rename = useStationDraftStore((s) => s.rename);
  const addStation = useStationDraftStore((s) => s.addStation);
  const removeStation = useStationDraftStore((s) => s.removeStation);

  return (
    <>
      <SectionHeading text={t('station.nameSection')} />
      <TextInput
        mode="outlined"
        dense
        value={name}
        placeholder={t('station.unnamed')}
        maxLength={MAX_NAME_LENGTH}
        onChangeText={rename}
        accessibilityLabel={t('station.a11y.name')}
        style={styles.field}
      />
      <View style={styles.actions}>
        <Button
          mode="outlined"
          icon="plus"
          onPress={() =>
            addStation((n) => t('station.defaultName', { number: n }))}
          accessibilityHint={t('station.a11y.addHint')}
        >
          {t('station.add')}
        </Button>
        <Button
          mode="text"
          icon="delete-outline"
          onPress={() => removeStation(activeId)}
          disabled={presets.length <= 1}
        >
          {t('station.remove')}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.xs },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
