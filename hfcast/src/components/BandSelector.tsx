import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import { BAND_ORDER } from '../data/types';
import type { BandKey } from '../data/types';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  value: BandKey;
  onChange: (band: BandKey) => void;
}

/**
 * The band every module on the screen is showing.
 *
 * One selector drives the whole screen: choosing a band recolours the map,
 * moves the window rail's tick and highlights the grid row. There is no
 * "best band" option — the grid shows every band at once, so an automatic
 * pick would only hide which band it chose.
 *
 * Band designations are not translated: 20m is 20m to operators everywhere,
 * the same reason grids and megahertz stay as they are.
 */
export default function BandSelector({ value, onChange }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  return (
    <View style={styles.wrap}>
      <Text style={[typography.label, styles.label, { color: ui.text4 }]}>
        {t('bands.label')}
      </Text>
      {
        /* A real horizontal scroller, not a wrapping row: nine chips are
           wider than a phone, and a second line would push the map down. */
      }
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {BAND_ORDER.map((band) => {
          const selected = value === band;
          return (
            <TouchableRipple
              key={band}
              onPress={() => onChange(band)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t('a11y.pinBand', { band })}
              style={[styles.chip, {
                backgroundColor: selected ? ui.accent : ui.card,
                borderColor: selected ? ui.accent : ui.line,
              }]}
            >
              <Text
                style={[typography.bodyStrong, numeric, {
                  color: selected ? ui.accentInk : ui.text2,
                }]}
              >
                {band}
              </Text>
            </TouchableRipple>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  label: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
