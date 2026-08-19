import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput, useTheme } from 'react-native-paper';

import { matching } from '../../data/stationDraft';
import {
  useDraftActiveId,
  useDraftField,
  useDraftPresets,
  useStationDraftStore,
} from '../../store/useStationDraftStore';
import type { StationPreset } from '../../store/useStationStore';
import { radius, spacing, typography } from '../../theme';
import type { AppTheme } from '../../theme';
import SectionHeading from './SectionHeading';

/**
 * Which station is being edited.
 *
 * The dialog could only edit the active one, so changing a saved station
 * meant closing it, picking that station from the main screen's menu and
 * opening it again.
 *
 * A typeahead rather than a list: the reader knows what is in their own
 * list, so with three stations the field is a label and with fifteen two
 * letters beat scrolling. It only selects — creating is the button below,
 * so a mistyped name cannot become a second station.
 */
export default function StationPicker() {
  const { t } = useTranslation();
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;
  const presets = useDraftPresets();
  const activeId = useDraftActiveId();
  const name = useDraftField((preset) => preset.name);
  const selectStation = useStationDraftStore((s) => s.selectStation);

  /**
   * What has been typed, or null when the field shows the station. Same
   * shape as the power and height fields: null follows the state, a
   * string means the reader is typing and the state must not overwrite it.
   */
  const [typed, setTyped] = useState<string | null>(null);

  const unnamed = t('station.unnamed');
  const nameOf = (option: StationPreset) =>
    option.name === '' ? unnamed : option.name;

  const open = typed !== null;
  const matches = matching(presets, typed ?? '', unnamed);

  const choose = (id: string) => {
    selectStation(id);
    setTyped(null);
  };

  return (
    <>
      <SectionHeading text={t('station.pickSection')} />
      <TextInput
        mode="outlined"
        dense
        value={typed ?? (name === '' ? unnamed : name)}
        onChangeText={setTyped}
        onFocus={() => setTyped('')}
        onBlur={() => setTyped(null)}
        placeholder={unnamed}
        right={
          <TextInput.Icon
            icon={open ? 'menu-up' : 'menu-down'}
            onPress={() => setTyped(open ? null : '')}
            accessibilityLabel={t('station.a11y.pickStation')}
          />
        }
        accessibilityLabel={t('station.a11y.pickStation')}
        style={styles.field}
      />

      {
        /* In the flow, not floating over the sections below: a dialog
           that already scrolls clips an overlay on one platform and not
           the other, and the list is short. */
      }
      {open
        ? (
          <View
            style={[styles.list, {
              borderColor: ui.line,
              backgroundColor: ui.card,
            }]}
          >
            {matches.length === 0
              ? (
                <Text
                  style={[typography.body, styles.empty, {
                    color: ui.text3,
                  }]}
                >
                  {t('station.noMatch')}
                </Text>
              )
              : matches.map((option) => (
                <Pressable
                  key={option.id}
                  // `onPressIn` rather than `onPress`: the field's blur
                  // arrives first on web and closes the list before a
                  // press can land on it.
                  onPressIn={() => choose(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.id === activeId }}
                  style={styles.option}
                >
                  <Text
                    style={[
                      option.id === activeId
                        ? typography.bodyStrong
                        : typography.body,
                      { color: option.id === activeId ? ui.accent : ui.ink },
                    ]}
                  >
                    {nameOf(option)}
                  </Text>
                </Pressable>
              ))}
          </View>
        )
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.xs },
  list: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.inset,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  empty: { padding: spacing.md },
});
