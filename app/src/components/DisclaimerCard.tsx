import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { PredictionBasis } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { face, spacing } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  ssn: number;
  basis: PredictionBasis;
  /**
   * The forecast came from the saved cache after a failed fetch. A saved
   * now-cast was driven by readings that are no longer current, so it is
   * described as climatology instead: the sunspot number it used is
   * still the truth about the run, but "driven by current readings" no
   * longer is.
   */
  saved?: boolean;
}

/**
 * The assumptions behind every number on the screen.
 *
 * Its own surface rather than a card, and quieter than everything above it —
 * this is the last thing on the screen and should read as a footnote, not as
 * another section competing for attention.
 *
 * Collapsible but never dismissible. A consumer-friendly skin on climatology
 * is one wrong assumption away from being read as a live forecast, so the
 * title states the basis even while the body is folded away.
 *
 * The antenna line is here because it is the single largest error the user
 * can be making. Every run is 100 W into a wire; a beam beats these numbers
 * and a compromise antenna will not reach them.
 */
export default function DisclaimerCard({ ssn, basis, saved = false }: Props) {
  const [open, setOpen] = useState(false);
  const effective: PredictionBasis = saved && basis === 'nowcast'
    ? 'climatology'
    : basis;
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  return (
    <View style={[styles.wrap, { backgroundColor: ui.discBg }]}>
      <TouchableRipple
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <View style={styles.headRow}>
          {
            /* The title names the basis, not whether a fetch succeeded. It
               used to say "Live data, not climatology" on every run that was
               not restored from the cache — including runs the space weather
               never reached, which are climatology, and including now-casts,
               which are also climatology with a different sunspot number in
               them. Both readings of it were wrong. */
          }
          <Text style={[styles.title, { color: ui.text2 }]}>
            {saved
              ? t('disclaimer.titleSaved')
              : t(`disclaimer.title.${effective}`)}
          </Text>
          <Text style={[styles.caret, { color: ui.accent }]}>
            {open ? '−' : '+'}
          </Text>
        </View>
      </TouchableRipple>
      {open
        ? (
          <View style={styles.body}>
            <Text style={[styles.text, { color: ui.text3 }]}>
              {t(`disclaimer.${effective}`, { ssn: f.integer(ssn) })}
            </Text>
            <Text style={[styles.text, { color: ui.text4 }]}>
              {t('disclaimer.station')}
            </Text>
          </View>
        )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: 16,
    gap: spacing.sm,
  },
  head: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: -spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 16,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
  },
  title: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: face.semibold },
  caret: { fontSize: 13, lineHeight: 18, fontFamily: face.bold },
  body: { gap: spacing.xs },
  text: { fontSize: 12, lineHeight: 18 },
});
