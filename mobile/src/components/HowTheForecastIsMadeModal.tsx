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
 * Named after the menu entry it opens, not "help" (user, 2026-08-11).
 * "Help" is a drawer: anything can be put in it and nothing has to be.
 * This screen has one subject, and the name now says so — which is also
 * the test the text has to pass.
 *
 * For a long time it did not pass it. It held two footnotes — an
 * antenna the model has no pattern for, and a mode of propagation the
 * map marks without naming — and nothing about where any of the numbers
 * came from. A reader who opened it to find out how the app works
 * learned neither.
 *
 * So it now answers its own title first: what computes the forecast,
 * the one input that drives it, what a colour on the map means, and how
 * the map is built. The two footnotes stay, at the end, as what they
 * always were.
 *
 * Every number in the text is read from the code that uses it rather
 * than written out here. Text that states a threshold and code that
 * applies one will drift apart, and the only person who finds out is
 * the reader.
 *
 * A section is one string, not one string per paragraph (user,
 * 2026-08-11). Which sentences share a paragraph, what order they come
 * in, and how many there are, are decisions each language makes for
 * itself, and a component that lays out fixed paragraphs makes them
 * once for every language. Splitting on the blank line moves that
 * choice into the translation, where it belongs, and costs nothing:
 * the spacing is still this file's.
 *
 * A heading still comes before what it introduces. That one is safe to
 * fix here — it is how documents are built rather than how a language
 * works, and right-to-left changes which edge a line starts at, not
 * which way blocks stack.
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
 * What separates one paragraph from the next inside a section.
 *
 * A blank line, because that is what it means everywhere else a person
 * writes, and a translator working in a plain text field will reach for
 * it without being told.
 */
const PARAGRAPH_BREAK = /\n\s*\n/;

/**
 * The sections, in the order they are read.
 *
 * Listed rather than written out one by one so that adding a section is
 * adding a line here and two strings per language, and so that nothing
 * can draw a heading whose body it forgot.
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
   * Keyed by the paragraph itself. Two identical paragraphs in one
   * section would be a repetition rather than a layout, so this is as
   * stable as the text is, and it survives a translation that splits a
   * section differently from the one before it.
   */
  const body = (text: string) =>
    text
      .split(PARAGRAPH_BREAK)
      .map((paragraph) => paragraph.trim())
      // A blank line left at either end of a pasted translation is a
      // habit, not a paragraph. Drawn, it would be an empty line of text
      // carrying a real margin, and the section would sit wrong for that
      // language alone.
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
   * Passed to every section rather than only the one that uses it —
   * i18next ignores what a string does not ask for, and a translator who
   * moves a number into a neighbouring sentence should not need this
   * file changed to allow it.
   */
  const values = {
    first: SSN_TABLE_RANGE.first,
    last: SSN_TABLE_RANGE.last,
    hours: NOWCAST_HOURS,
    reliable: Math.round(RELIABLE_AT * 100),
    patchy: Math.round(REACHABLE * 100),
    weak: Math.round(WEAK_AT * 100),
    // Grouped for reading, by the reader's own language: a German page
    // wants 34.560 where an English one wants 34,560. Where the runtime
    // has no locale data the number simply comes out ungrouped, which is
    // legible rather than wrong.
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
