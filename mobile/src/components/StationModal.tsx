import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  IconButton,
  Modal,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';

import { useStationStore } from '../store/useStationStore';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import AimSection from './station/AimSection';
import AntennaSection from './station/AntennaSection';
import ModeSection from './station/ModeSection';
import NameSection from './station/NameSection';
import PowerSection from './station/PowerSection';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /**
   * Bearing to the other end, degrees true, when a prediction is loaded.
   * Offers the one heading an operator actually wants for a beam, so it
   * does not have to be looked up and typed.
   */
  bearingToDestination?: number | undefined;
  /** Name of the other end, for the label on that button. */
  destinationLabel?: string | undefined;
  /**
   * The threshold the current forecast was actually computed at, as the
   * run reported it. Shown rather than derived, so the dialog cannot name
   * one number while the grid was worked out from another.
   *
   * Undefined when there is no forecast — this dialog opens from the
   * error screen too, so that power, mode and the antenna can still be
   * set. The threshold line is left out then rather than computed from
   * `data/modes.ts`. The app does hold that table and could produce a
   * number, and the number would describe a forecast that does not exist:
   * the mode shown here is the one about to be used, not the one the
   * absent answer was worked out from.
   */
  requiredSnrDb?: number | undefined;
}

/**
 * The radio: power, mode and antenna, under a name.
 *
 * These three used to be fixed at 100 W, a CW threshold and an isotropic
 * antenna, and nothing said so. They are here rather than in the theme
 * and language menu because they are not preferences about the display —
 * they change what the forecast says.
 *
 * The dialog itself is the frame and the order of the sections. Each
 * section owns its own controls, its own half-typed text and its own
 * reading of the store, because they share nothing except the station
 * they describe: it was one function of 587 lines in which the height
 * field and the aim button could only be read together.
 */
export default function StationModal(
  {
    visible,
    onDismiss,
    bearingToDestination,
    destinationLabel,
    requiredSnrDb,
  }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const reset = useStationStore((s) => s.reset);
  const setEditing = useStationStore((s) => s.setEditing);

  /*
   * Hold the forecast while this is open.
   *
   * Every control here changes the answer, and on a device the answer is an
   * engine run. Without this, deleting two digits of "100" ran a forecast at
   * "10" and another at "1" on the way to setting 1 W. The cleanup clears the
   * flag on unmount as well as on close, so a crash or a navigation cannot
   * leave the forecast frozen.
   */
  useEffect(() => {
    setEditing(visible);
    return () => setEditing(false);
  }, [visible, setEditing]);

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
            {t('station.title')}
          </Text>
          <IconButton
            icon="close"
            onPress={onDismiss}
            accessibilityLabel={t('station.close')}
            iconColor={ui.text2}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <NameSection />
          <ModeSection requiredSnrDb={requiredSnrDb} />
          <PowerSection />
          <AntennaSection />
          <AimSection
            bearingToDestination={bearingToDestination}
            destinationLabel={destinationLabel}
          />

          <Button mode="text" onPress={reset} style={styles.reset}>
            {t('station.reset')}
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  // Tablets get a centred dialog rather than a full-bleed sheet, matching
  // the location picker.
  modal: {
    margin: 20,
    maxWidth: 560,
    alignSelf: 'center',
    width: '90%',
    borderRadius: radius.card,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  reset: { marginTop: spacing.lg, alignSelf: 'flex-start' },
});
