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
  /** Set while the effect below drops focus on purpose. */
  const retaking = useRef(false);
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
    setUnlocked(arrived?.name === '');
  }, [activeId]);

  /*
   * Give the field the cursor once it is editable, and make sure a focus
   * event actually arrives.
   *
   * Web: pressing the pencil focuses the input before React has
   * processed the unlock, so Paper sees that event while it still holds
   * `editable={false}` and drops it (`TextInput.tsx`: handleFocus
   * returns early). No second event follows, because the element is
   * already the active one, so Paper stayed unfocused for good: the
   * field took the cursor and the keys and never drew the outline that
   * says so (user, 2026-08-20). Dropping focus first makes the next one
   * a real event, with the field editable by then.
   *
   * Android: `editable` is a prop and `focus()` is a view command, and
   * Fabric does not order a command behind the commit that carries the
   * prop. Focusing in this frame can reach a view that is still not
   * focusable, which leaves the field locked-looking until it is tapped
   * (user, 2026-08-20, on the 1.5.0 APK). A frame later the prop has
   * landed. Web does not need the wait and is not harmed by it.
   */
  useEffect(() => {
    if (!unlocked) return;
    const frame = requestAnimationFrame(() => {
      if (field.current?.isFocused()) {
        retaking.current = true;
        field.current.blur();
      }
      field.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [unlocked]);

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
        // Leaving the field locks it again, except where the effect
        // above dropped focus only to take it back.
        onBlur={() => {
          if (retaking.current) {
            retaking.current = false;
            return;
          }
          setUnlocked(false);
        }}
        accessibilityLabel={t('station.a11y.name')}
        right={
          <TextInput.Icon
            icon="pencil"
            onPress={() => setUnlocked(true)}
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
