import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';

import { useFormatters } from '../hooks/useFormatters';
import { MAX_DAY_OFFSET } from '../store/usePathStore';
import { radius, spacing, typography } from '../theme';

interface Props {
  value: number;
  onChange: (offset: number) => void;
}

/**
 * Picks which day the forecast describes.
 *
 * VOACAP is monthly climatology, so days inside one month share a prediction
 * and only differ once the month, and therefore the assumed sunspot number,
 * changes. The disclaimer carries that caveat rather than this control, which
 * is why days beyond today are still worth offering: the reader treats them
 * the way they treat any weather forecast, as a guess that decays with time.
 */
export default function DaySelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const f = useFormatters();

  const today = new Date();
  const days = Array.from({ length: MAX_DAY_OFFSET + 1 }, (_, offset) => {
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + offset,
      ),
    );
    return { offset, date };
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {days.map(({ offset, date }) => (
        <Chip
          key={offset}
          selected={value === offset}
          showSelectedCheck={false}
          onPress={() => onChange(offset)}
          accessibilityLabel={offset === 0 ? t('days.today') : f.dayLabel(date)}
          style={styles.chip}
          textStyle={typography.bodyStrong}
        >
          {offset === 0 ? t('days.today') : f.dayLabel(date)}
        </Chip>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    marginVertical: 2,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.inset,
  },
});
