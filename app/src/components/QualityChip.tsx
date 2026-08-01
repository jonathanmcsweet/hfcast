import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { face, numeric } from '../theme';
import type { AppTheme, QualityKey } from '../theme';

interface Props {
  quality: QualityKey;
  /** The readout badge. Smaller everywhere else. */
  large?: boolean;
}

/**
 * The state in a word, on its own colour.
 *
 * A plain view rather than a Material chip: a chip is a control, and this is
 * a label. Paper's chip also brings its own height, ripple and touch target,
 * none of which belong on something that cannot be pressed.
 */
export default function QualityChip({ quality, large }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const c = theme.colors.quality[quality];

  return (
    <View
      style={[
        styles.pill,
        large ? styles.pillLarge : styles.pillSmall,
        { backgroundColor: c.base },
      ]}
    >
      <Text
        style={[
          large ? styles.textLarge : styles.textSmall,
          numeric,
          { color: c.onBase },
        ]}
      >
        {t(`quality.${quality}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: 10 },
  pillSmall: { paddingHorizontal: 8, paddingVertical: 4 },
  pillLarge: { paddingHorizontal: 12, paddingVertical: 6 },
  // Heavier than any other text at this size. The badge has to survive being
  // read at a glance in sunlight, which weight buys and size would cost.
  textSmall: { fontSize: 12, lineHeight: 18, fontFamily: face.bold },
  textLarge: { fontSize: 13, lineHeight: 18, fontFamily: face.bold },
});
