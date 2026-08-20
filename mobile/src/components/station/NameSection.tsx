import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  type TextInput as NativeTextInput,
  View,
} from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';

import { needsName } from '../../data/stationDraft';
import {
  useDraftActiveId,
  useDraftField,
  useDraftPresets,
  useStationDraftStore,
} from '../../store/useStationDraftStore';
import { MAX_NAME_LENGTH, useStationStore } from '../../store/useStationStore';
import { spacing, typography } from '../../theme';
import type { AppTheme } from '../../theme';
import SectionHeading from './SectionHeading';

/**
 * The name of the station being edited.
 *
 * Locked, with a pencil to unlock it. A name is what tells two stations
 * apart in the picker, the header and the menu, so it should take a
 * deliberate press to change — the field beneath a dropdown invited
 * edits nobody meant to make (user, 2026-08-20).
 *
 * Opens itself for a station that arrives without a name, which is what
 * the picker's Add row makes. Held open until the field is left, rather
 * than for as long as the name is empty: derived from the name, it shut
 * on the first letter typed (user, 2026-08-20). Nothing saves until that
 * station is named — see `needsName`.
 */
export default function NameSection() {
  const { t } = useTranslation();
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;
  const name = useDraftField((preset) => preset.name);
  const presets = useDraftPresets();
  const activeId = useDraftActiveId();
  const rename = useStationDraftStore((s) => s.rename);
  const removeStation = useStationDraftStore((s) => s.removeStation);
  const savedPresets = useStationStore((s) => s.presets);

  const field = useRef<NativeTextInput>(null);
  const [unlocked, setUnlocked] = useState(false);

  const missing = needsName(presets, savedPresets);

  /*
   * Moving to another station locks the field, and moving to one with no
   * name opens it and puts the cursor in it: the Add row makes exactly
   * that, and it has to be named before anything can be saved.
   *
   * Not on the first run, or opening the dialog on a station saved
   * without a name would raise a keyboard nobody asked for.
   */
  const opening = useRef(true);
  useEffect(() => {
    if (opening.current) {
      opening.current = false;
      return;
    }
    const { presets: held } = useStationDraftStore.getState().draft;
    const arrived = held.find((preset) => preset.id === activeId);
    const blank = arrived?.name === '';
    setUnlocked(blank);
    if (blank) field.current?.focus();
  }, [activeId]);

  return (
    <>
      <SectionHeading text={t('station.nameSection')} />
      <TextInput
        ref={field}
        mode="outlined"
        dense
        editable={unlocked}
        value={name}
        placeholder={t('station.unnamed')}
        maxLength={MAX_NAME_LENGTH}
        onChangeText={rename}
        onBlur={() => setUnlocked(false)}
        accessibilityLabel={t('station.a11y.name')}
        right={
          <TextInput.Icon
            icon="pencil"
            onPress={() => {
              setUnlocked(true);
              field.current?.focus();
            }}
            accessibilityLabel={t('station.a11y.editName')}
          />
        }
        style={styles.field}
      />
      {missing
        ? (
          <Text style={[typography.caption, styles.hint, { color: ui.text3 }]}>
            {t('station.needsName')}
          </Text>
        )
        : null}
      <View style={styles.actions}>
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
  hint: { marginTop: spacing.xs },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
