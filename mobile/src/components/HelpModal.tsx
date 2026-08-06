import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { INVERTED_V_HEIGHT_FRACTION } from '../data/antennaFile';
import { NVIS_MIN_ANGLE_DEG } from '../data/quality';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * What the app does that a reader cannot see it doing.
 *
 * Not a manual. Everything on the forecast screen already says what it
 * is, in the place it is. This holds the two things that are decisions
 * rather than readings: an antenna the model has no pattern for, which is
 * therefore approximated, and a mode of propagation the map marks but
 * does not explain.
 *
 * An approximation stated in a comment is a note to whoever reads the
 * code. Stated here it is a note to whoever reads the forecast, which is
 * who it changes the answer for.
 */

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/** The percentage the approximation uses, as the text needs to name it. */
const HEIGHT_PERCENT = Math.round(INVERTED_V_HEIGHT_FRACTION * 100);

export default function HelpModal({ visible, onDismiss }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
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
