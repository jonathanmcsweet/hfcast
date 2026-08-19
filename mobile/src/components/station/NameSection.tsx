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
 * The name of the station being edited, and the two buttons that make and
 * remove one.
 *
 * The picker above chooses which station this is; this renames it. Two
 * controls rather than one because a field that both filtered a list and
 * renamed what it found would do a different thing depending on what was
 * already typed into it.
 *
 * A new station arrives already named ("Station 2"), so this field is
 * never empty for one the reader has just made. It used to be, and a
 * field showing nothing but its placeholder is indistinguishable from a
 * form that was never filled in — which is why adding a station read as
 * losing one (user, 2026-08-18).
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
