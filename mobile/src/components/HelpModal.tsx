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
 * It is called "How the forecast is made", and for a long time it did
 * not say that. It held two footnotes — an antenna the model has no
 * pattern for, and a mode of propagation the map marks without naming —
 * and nothing about where any of the numbers came from. A reader who
 * opened it to find out how the app works learned neither (user,
 * 2026-08-11).
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
 */

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/** The percentage the approximation uses, as the text needs to name it. */
const HEIGHT_PERCENT = Math.round(INVERTED_V_HEIGHT_FRACTION * 100);

/** How long a reading stays current, in hours, as the text names it. */
const NOWCAST_HOURS = Math.round(NOWCAST_GOOD_FOR_MS / (60 * 60 * 1000));

export default function HelpModal({ visible, onDismiss }: Props) {
  const theme = useTheme<AppTheme>();
  const { i18n, t } = useTranslation();
  const ui = theme.colors.ui;

  const heading = (text: string) => (
    <Text style={[typography.label, styles.heading, { color: ui.text4 }]}>
      {text}
    </Text>
  );

  const para = (text: string) => (
    <Text style={[typography.body, styles.para, { color: ui.text2 }]}>
      {text}
    </Text>
  );

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
          {heading(t('help.engine.heading'))}
          {para(t('help.engine.what'))}
          {para(t('help.engine.limits'))}

          {heading(t('help.ssn.heading'))}
          {para(t('help.ssn.why'))}
          {para(
            t('help.ssn.offline', {
              first: SSN_TABLE_RANGE.first,
              last: SSN_TABLE_RANGE.last,
            }),
          )}
          {para(t('help.ssn.live', { hours: NOWCAST_HOURS }))}

          {heading(t('help.colours.heading'))}
          {para(
            t('help.colours.what', {
              reliable: Math.round(RELIABLE_AT * 100),
              patchy: Math.round(REACHABLE * 100),
              weak: Math.round(WEAK_AT * 100),
            }),
          )}

          {heading(t('help.map.heading'))}
          {
            /* Grouped for reading, by the reader's own language: a
               German page wants 34.560 where an English one wants
               34,560. Where the runtime has no locale data the number
               simply comes out ungrouped, which is legible rather than
               wrong. */
          }
          {para(
            t('help.map.stages', {
              points: FINE_POINTS.toLocaleString(i18n.language),
            }),
          )}
          {para(t('help.map.month'))}

          {heading(t('help.invertedV.heading'))}
          {para(t('help.invertedV.noModel'))}
          {para(t('help.invertedV.whatWeDo', { percent: HEIGHT_PERCENT }))}
          {para(t('help.invertedV.whyItIsFair'))}
          {para(t('help.invertedV.limits'))}

          {heading(t('help.nvis.heading'))}
          {para(t('help.nvis.what'))}
          {para(t('help.nvis.howWeKnow', { degrees: NVIS_MIN_ANGLE_DEG }))}
          {para(t('help.nvis.onTheMap'))}
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
