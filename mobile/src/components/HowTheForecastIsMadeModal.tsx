import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { REACHABLE } from '../../../shared/coverageGrid';
import { INVERTED_V_HEIGHT_FRACTION } from '../data/antennaFile';
import { FINE_POINTS } from '../data/fineGlobe';
import { NVIS_MIN_ANGLE_DEG, RELIABLE_AT, WEAK_AT } from '../data/quality';
import { NOWCAST_GOOD_FOR_MS } from '../data/spaceWeather';
import { SSN_TABLE_RANGE } from '../data/ssn';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * What the app does that a reader cannot see it doing.
 *
 * Named after the menu entry it opens, not "help" (user, 2026-08-11):
 * "help" is a drawer anything can go in, and this screen has one subject.
 * That is also the test its text has to pass, which it failed for a long
 * time — two footnotes about an antenna and a mode of propagation, and
 * nothing about where the numbers came from. It now answers its title
 * first: what computes the forecast, the input that drives it, what a
 * colour means, how the map is built. The footnotes stay at the end.
 *
 * Every number is read from the code that uses it. Text stating a
 * threshold and code applying one drift apart, and the only person who
 * finds out is the reader.
 *
 * A section is one string, not one per paragraph (user, 2026-08-11).
 * Which sentences share a paragraph, and how many there are, is each
 * language's decision; splitting on the blank line moves that into the
 * translation and costs nothing, since the spacing is still this file's.
 *
 * A heading still comes before what it introduces: that is how documents
 * are built rather than how a language works, and right-to-left changes
 * which edge a line starts at, not which way blocks stack.
 */

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/** The percentage the approximation uses, as the text needs to name it. */
const HEIGHT_PERCENT = Math.round(INVERTED_V_HEIGHT_FRACTION * 100);

/** How long a reading stays current, in hours, as the text names it. */
const NOWCAST_HOURS = Math.round(NOWCAST_GOOD_FOR_MS / (60 * 60 * 1000));

/**
 * What separates one paragraph from the next inside a section. A blank
 * line, because a translator in a plain text field reaches for it
 * without being told.
 */
const PARAGRAPH_BREAK = /\n\s*\n/;

/**
 * The sections, in the order they are read. Listed rather than written
 * out, so adding one is a line here and two strings per language, and
 * nothing can draw a heading whose body it forgot.
 */
const SECTIONS = [
  'engine',
  'truecast',
  'ssn',
  'colours',
  'map',
  'invertedV',
  'nvis',
] as const;

export default function HowTheForecastIsMadeModal(
  { visible, onDismiss }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { i18n, t } = useTranslation();
  const ui = theme.colors.ui;

  const heading = (text: string) => (
    <Text style={[typography.label, styles.heading, { color: ui.text4 }]}>
      {text}
    </Text>
  );

  /**
   * One section's text, as however many paragraphs it was written in.
   *
   * Keyed by the paragraph itself: two identical paragraphs would be a
   * repetition rather than a layout, so the key is as stable as the text
   * and survives a translation that splits a section differently.
   */
  const body = (text: string) =>
    text
      .split(PARAGRAPH_BREAK)
      .map((paragraph) => paragraph.trim())
      // A blank line at either end of a pasted translation is a habit,
      // not a paragraph. Drawn, it carries a real margin and the section
      // sits wrong for that language alone.
      .filter((paragraph) => paragraph.length > 0)
      .map((paragraph) => (
        <Text
          key={paragraph}
          style={[typography.body, styles.para, { color: ui.text2 }]}
        >
          {paragraph}
        </Text>
      ));

  /**
   * What each section names, for the section that names it.
   *
   * Passed to every section, not only the one that uses it: i18next
   * ignores what a string does not ask for, and a translator moving a
   * number into a neighbouring sentence should not need this file changed.
   */
  const values = {
    first: SSN_TABLE_RANGE.first,
    last: SSN_TABLE_RANGE.last,
    hours: NOWCAST_HOURS,
    reliable: Math.round(RELIABLE_AT * 100),
    patchy: Math.round(REACHABLE * 100),
    weak: Math.round(WEAK_AT * 100),
    // Grouped by the reader's own language: a German page wants 34.560
    // where an English one wants 34,560. With no locale data it comes
    // out ungrouped, which is legible rather than wrong.
    points: FINE_POINTS.toLocaleString(i18n.language),
    percent: HEIGHT_PERCENT,
    degrees: NVIS_MIN_ANGLE_DEG,
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={styles.headerRow}>
          <Text
            style={[typography.cardHeadline, styles.title, { color: ui.ink }]}
          >
            {t('help.title')}
          </Text>
          <IconButton
            icon="close"
            onPress={onDismiss}
            accessibilityLabel={t('help.close')}
            iconColor={ui.text2}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {SECTIONS.map((section) => (
            <View key={section}>
              {heading(t(`help.${section}.heading`))}
              {body(t(`help.${section}.body`, values))}
            </View>
          ))}
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: spacing.lg,
    marginVertical: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radius.card,
    maxHeight: '85%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  heading: { marginTop: spacing.lg, marginBottom: spacing.xs },
  para: { marginBottom: spacing.sm },
});
