import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';

import { BAND_ORDER } from '../data/types';
import type { BandKey } from '../data/types';

interface Props {
  /** Null means the view follows whichever band is best. */
  value: BandKey | null;
  onChange: (band: BandKey | null) => void;
}

/**
 * Pins the hero and hourly strip to one band.
 *
 * Band designations are not translated: 20m is 20m to operators everywhere,
 * which is the same reason grids and MHz stay as they are.
 */
export default function BandSelector({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Chip
        selected={value === null}
        showSelectedCheck={false}
        onPress={() => onChange(null)}
        accessibilityLabel={t('a11y.followBestBand')}
        style={styles.chip}
      >
        {t('bands.best')}
      </Chip>
      {BAND_ORDER.map((band) => (
        <Chip
          key={band}
          selected={value === band}
          showSelectedCheck={false}
          onPress={() => onChange(value === band ? null : band)}
          accessibilityLabel={t('a11y.pinBand', { band })}
          style={styles.chip}
        >
          {band}
        </Chip>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 8 },
  chip: { marginVertical: 2 },
});
