import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Divider, Icon, Text, useTheme } from 'react-native-paper';

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
 * A dropdown and nothing else. It was a typeahead: a field that both
 * filtered and displayed, beside a name field that renamed. Two text
 * fields a line apart doing different things read as one confused
 * control (user, 2026-08-20).
 *
 * Adding is the last row of the list rather than a button beside it,
 * which is where Android puts it — Wi-Fi networks, Gmail accounts,
 * keyboards. It keeps every control of this section inside the two
 * fields.
 */
export default function StationPicker() {
  const { t } = useTranslation();
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;
  const presets = useDraftPresets();
  const activeId = useDraftActiveId();
  const name = useDraftField((preset) => preset.name);
  const selectStation = useStationDraftStore((s) => s.selectStation);
  const addStation = useStationDraftStore((s) => s.addStation);

  const [open, setOpen] = useState(false);

  const unnamed = t('station.unnamed');
  const nameOf = (option: StationPreset) =>
    option.name === '' ? unnamed : option.name;

  return (
    <>
      <SectionHeading text={t('station.pickSection')} />
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('station.a11y.pickStation')}
        // No fill, so it reads as one column with the outlined name
        // field under it.
        style={[styles.field, { borderColor: open ? ui.accent : ui.line }]}
      >
        <Text
          numberOfLines={1}
          style={[typography.body, styles.value, { color: ui.ink }]}
        >
          {name === '' ? unnamed : name}
        </Text>
        <Icon
          source={open ? 'menu-up' : 'menu-down'}
          size={20}
          color={ui.text2}
        />
      </Pressable>

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
            {presets.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => {
                  selectStation(option.id);
                  setOpen(false);
                }}
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

            <Divider />

            <Pressable
              onPress={() => {
                addStation();
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityHint={t('station.a11y.addHint')}
              style={[styles.option, styles.add]}
            >
              <Icon source="plus" size={18} color={ui.accent} />
              <Text style={[typography.body, { color: ui.accent }]}>
                {t('station.add')}
              </Text>
            </Pressable>
          </View>
        )
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Sized and spaced as the outlined text fields below it, so the two
  // read as one column of controls.
  field: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.inset,
  },
  value: { flex: 1 },
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
  // Left, with the names above it, rather than centred by the row
  // above's own vertical centring.
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
});
