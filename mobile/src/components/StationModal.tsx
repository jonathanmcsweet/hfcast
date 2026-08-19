import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  IconButton,
  Modal,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';

import { forStore, isDirty } from '../data/stationDraft';
import { useDraft, useStationDraftStore } from '../store/useStationDraftStore';
import { useStationStore } from '../store/useStationStore';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import AimSection from './station/AimSection';
import AntennaSection from './station/AntennaSection';
import ModeSection from './station/ModeSection';
import NameSection from './station/NameSection';
import PowerSection from './station/PowerSection';
import StationPicker from './station/StationPicker';

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
 * Nothing here writes to the store until Save. The dialog edits a draft
 * (`data/stationDraft.ts`), which is what gives Cancel something to throw
 * away and Save something to do. Before that the sections wrote straight
 * through, so the only button that looked like a commit was "Add a
 * station" — which made a copy and moved to it, and read as losing the
 * work rather than keeping it (user, 2026-08-18).
 *
 * The dialog is the frame, the order of the sections and the footer. Each
 * section owns its own controls and its own half-typed text, because they
 * share nothing except the station they describe: it was one function of
 * 587 lines in which the height field and the aim button could only be
 * read together.
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

  const presets = useStationStore((s) => s.presets);
  const activeId = useStationStore((s) => s.activeId);
  const commit = useStationStore((s) => s.commit);
  const setEditing = useStationStore((s) => s.setEditing);

  const saved = useMemo(() => ({ presets, activeId }), [presets, activeId]);
  const draft = useDraft();
  const begin = useStationDraftStore((s) => s.begin);
  const [asking, setAsking] = useState(false);

  const dirty = isDirty(draft, saved);

  /*
   * Start the draft again each time the dialog opens.
   *
   * In an effect rather than during a render, because the draft lives in
   * a store outside this component and writing to one while rendering is
   * what React warns about.
   *
   * A layout effect and not an ordinary one. An ordinary effect runs
   * after the frame is drawn, and the draft is empty until this has run
   * — so the dialog would open showing the defaults the empty draft
   * falls back to, 100 W to an isotropic antenna, and replace them with
   * the reader's own station a frame later. This runs before anything is
   * shown.
   */
  useLayoutEffect(() => {
    if (!visible) return;
    // Read at the moment of opening rather than closed over. Following
    // the stored value afterwards would undo the reader's edits whenever
    // anything else touched the store, and taking it from a dependency
    // list is the same bug written more convincingly.
    const { presets: held, activeId: heldId } = useStationStore.getState();
    begin({ presets: held, activeId: heldId });
  }, [visible, begin]);

  /*
   * Hold the forecast while this is open.
   *
   * The draft is the reason this is still needed, not a leftover: the
   * dialog opens on top of a forecast that was computed for the saved
   * station, and a run started from a half-finished draft would describe
   * a station nobody has asked for yet. The cleanup clears the flag on
   * unmount as well as on close, so a crash or a navigation cannot leave
   * the forecast frozen.
   */
  useEffect(() => {
    setEditing(visible);
    return () => setEditing(false);
  }, [visible, setEditing]);

  const close = useCallback(() => {
    setAsking(false);
    onDismiss();
  }, [onDismiss]);

  const save = useCallback(() => {
    commit(forStore(draft));
    close();
  }, [commit, draft, close]);

  // The × and a tap outside both mean "leave", and both have to ask when
  // there is something to lose. Asking when there is nothing to lose
  // would train the reader to dismiss the question without reading it.
  const leave = useCallback(() => {
    if (dirty) setAsking(true);
    else close();
  }, [dirty, close]);

  return (
    <>
      <Portal>
        <Modal
          visible={visible}
          onDismiss={leave}
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View style={styles.headerRow}>
            <Text
              style={[typography.cardHeadline, styles.title, {
                color: ui.ink,
              }]}
            >
              {t('station.title')}
            </Text>
            <IconButton
              icon="close"
              onPress={leave}
              accessibilityLabel={t('station.close')}
              iconColor={ui.text2}
            />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <StationPicker />
            <NameSection />
            <ModeSection requiredSnrDb={requiredSnrDb} />
            <PowerSection />
            <AntennaSection />
            <AimSection
              bearingToDestination={bearingToDestination}
              destinationLabel={destinationLabel}
            />

            <ResetButton />
          </ScrollView>

          {
            /* Outside the scroll view, so the two buttons that end the
               dialog are reachable without scrolling past an antenna
               section that changes length with the antenna. */
          }
          <View style={[styles.footer, { borderTopColor: ui.line }]}>
            <Button mode="text" onPress={leave}>
              {t('station.cancel')}
            </Button>
            <Button mode="contained" onPress={save} disabled={!dirty}>
              {t('station.save')}
            </Button>
          </View>
        </Modal>
      </Portal>

      {
        /* Its own portal, so the question sits above the dialog that
           asked it rather than beside it in the same host. */
      }
      <Portal>
        <Dialog visible={asking} onDismiss={() => setAsking(false)}>
          <Dialog.Title>{t('station.discardTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text style={typography.body}>{t('station.discardBody')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAsking(false)}>
              {t('station.keepEditing')}
            </Button>
            <Button onPress={close}>{t('station.discard')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

/** Its own component so it subscribes to the action and not the draft. */
function ResetButton() {
  const { t } = useTranslation();
  const reset = useStationDraftStore((s) => s.reset);
  return (
    <Button mode="text" onPress={reset} style={styles.reset}>
      {t('station.reset')}
    </Button>
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
