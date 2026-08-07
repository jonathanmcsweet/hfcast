import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import {
  MAX_NAME_LENGTH,
  useActivePreset,
  useStationStore,
} from '../../store/useStationStore';
import { spacing } from '../../theme';
import SectionHeading from './SectionHeading';

/**
 * The name, and the two buttons that make and remove a station.
 *
 * First in the dialog, because everything below it belongs to this one
 * station. A licence does not come with one radio: a base with a beam and
 * a portable with a wire give different answers, and both are true.
 */
export default function NameSection() {
  const { t } = useTranslation();
  const preset = useActivePreset();
  const presets = useStationStore((s) => s.presets);
  const activeId = useStationStore((s) => s.activeId);
  const rename = useStationStore((s) => s.rename);
  const addPreset = useStationStore((s) => s.addPreset);
  const removePreset = useStationStore((s) => s.removePreset);

  return (
    <>
      <SectionHeading text={t('station.nameSection')} />
      <TextInput
        mode="outlined"
        dense
        value={preset.name}
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
          onPress={addPreset}
          accessibilityHint={t('station.a11y.addHint')}
        >
          {t('station.add')}
        </Button>
        <Button
          mode="text"
          icon="delete-outline"
          onPress={() => removePreset(activeId)}
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
