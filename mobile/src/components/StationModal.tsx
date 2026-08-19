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
   * Saves an operator looking up the heading a beam wants.
   */
  bearingToDestination?: number | undefined;
  /** Name of the other end, for the label on that button. */
  destinationLabel?: string | undefined;
  /**
   * The threshold the forecast was computed at, as the run reported it.
   * Reported rather than derived, so the dialog cannot name one number
   * while the grid was worked out from another.
   *
   * Undefined where there is no forecast — this dialog opens from the
   * error screen too. The line is left out rather than computed from
   * `data/modes.ts`, which would describe a forecast that does not exist.
   */
  requiredSnrDb?: number | undefined;
}

/**
 * The radio: power, mode and antenna, under a name.
 *
 * Not in the theme and language menu, because these are not preferences
 * about the display — they change what the forecast says. All three used
 * to be fixed at 100 W, a CW threshold and an isotropic antenna, unsaid.
 *
 * Nothing writes to the store until Save: the dialog edits a draft
 * (`data/stationDraft.ts`), which gives Cancel something to drop and Save
 * something to do. The sections used to write straight through, leaving
 * "Add a station" as the only button that looked like a commit — and it
 * made a copy and moved to it, which read as losing the work
 * (user, 2026-08-18).
 *
 * This file is the frame, the order of the sections and the footer. Each
 * section owns its own controls and half-typed text: it was one function
 * of 587 lines in which the height field and the aim button could only be
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
   * In an effect because the draft lives in a store outside this
   * component, and React warns about writing to one while rendering.
   *
   * A layout effect: an ordinary one runs after the frame is drawn, so
   * the dialog would open on the empty draft's fallback — 100 W to an
   * isotropic antenna — and swap in the reader's station a frame later.
   */
  useLayoutEffect(() => {
    if (!visible) return;
    // Read at the moment of opening, not closed over. Following the
    // stored value afterwards would undo the reader's edits whenever
    // anything else touched the store.
    const { presets: held, activeId: heldId } = useStationStore.getState();
    begin({ presets: held, activeId: heldId });
  }, [visible, begin]);

  /*
   * Hold the forecast while this is open: a run started from a
   * half-finished draft would describe a station nobody has asked for.
   * The cleanup clears the flag on unmount as well as on close, so a
   * crash or a navigation cannot leave the forecast frozen.
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

  // The × and a tap outside both mean "leave", and both ask when there is
  // something to lose. Asking when there is not would train the reader to
  // dismiss the question unread.
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
            /* Outside the scroll view: the two buttons that end the
               dialog stay reachable without scrolling past an antenna
               section whose length changes with the antenna. */
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
  // Tablets get a centred dialog rather than a full-width sheet, matching
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
