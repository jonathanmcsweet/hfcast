import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Divider,
  IconButton,
  Modal,
  Portal,
  ProgressBar,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { BAND_ORDER } from '../../../shared/bands';
import { FINE_POINTS } from '../data/fineGlobe';
import { forgetStored, storedBytes } from '../data/globeStore';
import { precompute, remainingFiles, stopPrecompute } from '../data/precompute';
import {
  costOf,
  filesWithin,
  runsFor,
  SCOPE_MONTHS,
  type ScopeMonths,
} from '../data/precomputePlan';
import { useDeviceStore } from '../store/useDeviceStore';
import { usePathStore } from '../store/usePathStore';
import { usePrecomputeStore } from '../store/usePrecomputeStore';
import {
  MAP_BUDGET_CHOICES,
  useSettingsStore,
} from '../store/useSettingsStore';
import {
  activePreset,
  stationKey,
  useStationStore,
} from '../store/useStationStore';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * Computing maps before they are needed, and the room they take.
 *
 * The screen for the case this feature exists for: a person at home, on a
 * charger, setting the app up for a day out where there is no network.
 *
 * What it shows before anything runs is the whole point of it. A whole
 * year of every band is about 171 MB and over an hour of work, and that
 * has to be a choice somebody makes rather than a surprise they get. So
 * the size and the time are worked out from what this device measured
 * about itself — never from a fast one — and shown beside the choice
 * that produced them.
 */
interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/** A megabyte, as the sizes here are counted. */
const MB = 1024 * 1024;

/**
 * A size a person can read.
 *
 * `MB` is left as it is rather than translated: it is written the same
 * way in every language this app ships, and a translated abbreviation
 * would be less recognisable rather than more.
 */
const describeSize = (bytes: number): string =>
  bytes >= MB * 1024
    ? `${(bytes / (MB * 1024)).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / MB))} MB`;

/** A length of time a person can read, rounded the safe way — upwards. */
function describeTime(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const left = minutes % 60;
  return left === 0 ? `${hours} h` : `${hours} h ${left} min`;
}

export default function MapsModal({ visible, onDismiss }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const months = useSettingsStore((state) => state.precomputeMonths);
  const setMonths = useSettingsStore((state) => state.setPrecomputeMonths);
  const bands = useSettingsStore((state) => state.precomputeBands);
  const setBands = useSettingsStore((state) => state.setPrecomputeBands);
  const budgetMb = useSettingsStore((state) => state.mapBudgetMb);
  const setBudgetMb = useSettingsStore((state) => state.setMapBudgetMb);

  const running = usePrecomputeStore((state) => state.running);
  const done = usePrecomputeStore((state) => state.done);
  const total = usePrecomputeStore((state) => state.total);
  const failed = usePrecomputeStore((state) => state.failed);
  const at = usePrecomputeStore((state) => state.at);
  const wasStopped = usePrecomputeStore((state) => state.stopped);

  const from = usePathStore((state) => state.from);
  const band = usePathStore((state) => state.band);
  const presets = useStationStore((state) => state.presets);
  const activeId = useStationStore((state) => state.activeId);
  // Remembered so its identity is stable: `ask` below depends on it, and
  // a new object every render would restart the effect every render.
  const station = useMemo(
    () => activePreset({ presets, activeId }),
    [presets, activeId],
  );

  // This device's own speed, at one thread — which is the number this
  // estimate wants, because work computed ahead runs one piece at a time
  // behind the reader. Null until the device has measured itself, and
  // then the time is not guessed at.
  const measured = useDeviceMeasurement();

  const [held, setHeld] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Held together rather than passed apart, and remembered between
  // renders, because the effect below reads it: rebuilding it every
  // render would list the directory every render.
  const ask = useMemo(
    () => ({
      from,
      station,
      stationKey: stationKey(station),
      bands,
      months,
      budgetBytes: budgetMb * MB,
    }),
    [from, station, bands, months, budgetMb],
  );

  // The room in use and the work left, read when the dialog opens, when
  // the choice changes, and again when a job stops. Deliberately not
  // read while one runs: the directory would be listed over and over to
  // move a number nobody is watching that closely, and the progress
  // line is what matters during a job.
  //
  // The work left comes from the job itself rather than from the
  // calendar, so the estimate counts the grids that will really be
  // computed and not the ones a fresh device would have needed.
  useEffect(() => {
    if (!visible || running) return;
    let alive = true;
    void storedBytes().then((bytes) => {
      if (alive) setHeld(bytes);
    });
    void remainingFiles(ask).then((files) => {
      if (alive) setLeft(files);
    });
    return () => {
      alive = false;
    };
  }, [visible, running, ask]);

  const everyBand = bands.length === BAND_ORDER.length;
  const cost = costOf(
    // Before the count arrives, the estimate is drawn from the whole
    // scope: too large rather than too small, which is the safe way for
    // a number somebody is about to commit an hour to.
    left ?? runsFor(startOfNow(), months).length * bands.length,
    1,
    FINE_POINTS,
    measured ?? 0,
  );
  const fits = filesWithin(budgetMb * MB, FINE_POINTS);

  const start = () => {
    setNote(null);
    setLeft(null);
    void precompute(ask);
  };

  const forget = async () => {
    await forgetStored();
    setHeld(await storedBytes());
    setNote(t('maps.forgotten'));
    AccessibilityInfo.announceForAccessibility(t('maps.forgotten'));
  };

  const choice = (
    label: string,
    chosen: boolean,
    onPress: () => void,
    key: string,
  ) => (
    <TouchableRipple
      key={key}
      onPress={onPress}
      disabled={running}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen, disabled: running }}
      style={[
        styles.pill,
        {
          borderColor: chosen ? theme.colors.primary : ui.line,
          backgroundColor: chosen
            ? theme.colors.primaryContainer
            : 'transparent',
        },
      ]}
    >
      <Text
        style={[
          typography.body,
          { color: chosen ? theme.colors.onPrimaryContainer : ui.text2 },
        ]}
      >
        {label}
      </Text>
    </TouchableRipple>
  );

  const heading = (text: string) => (
    <Text style={[typography.label, styles.heading, { color: ui.text4 }]}>
      {text}
    </Text>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        {
          // While a job runs, a tap outside would close the only place
          // its progress is shown. The close icon goes too, so the
          // dialog does not offer a way out it would ignore.
          ...(running ? {} : { onDismiss })
        }
        dismissable={!running}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={styles.headerRow}>
          <Text
            style={[typography.cardHeadline, styles.title, { color: ui.ink }]}
          >
            {t('maps.title')}
          </Text>
          {running ? null : (
            <IconButton
              icon="close"
              onPress={onDismiss}
              accessibilityLabel={t('maps.close')}
              iconColor={ui.text2}
            />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[typography.body, { color: ui.text2 }]}>
            {t('maps.what')}
          </Text>

          {heading(t('maps.monthsSection'))}
          <View style={styles.pills}>
            {SCOPE_MONTHS.map((count) =>
              choice(
                t(`maps.months.${count}`),
                months === count,
                () => setMonths(count as ScopeMonths),
                `month-${count}`,
              )
            )}
          </View>

          {heading(t('maps.bandsSection'))}
          <View style={styles.pills}>
            {choice(
              t('maps.bandsAll'),
              everyBand,
              () => setBands(BAND_ORDER),
              'bands-all',
            )}
            {choice(
              t('maps.bandsOne', { band }),
              !everyBand,
              () => setBands([band]),
              'bands-one',
            )}
          </View>

          {heading(t('maps.roomSection'))}
          <View style={styles.pills}>
            {MAP_BUDGET_CHOICES.map((mb) =>
              choice(
                describeSize(mb * MB),
                budgetMb === mb,
                () => setBudgetMb(mb),
                `room-${mb}`,
              )
            )}
          </View>

          <Divider style={styles.divider} />

          {running
            ? (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={t('maps.a11yProgress', { done, total })}
              >
                <Text style={[typography.body, { color: ui.ink }]}>
                  {t('maps.running', { done, total })}
                </Text>
                <ProgressBar
                  progress={total === 0 ? 0 : done / total}
                  style={styles.bar}
                />
                {at === null
                  ? null
                  : (
                    <Text style={[typography.caption, { color: ui.text4 }]}>
                      {at}
                    </Text>
                  )}
              </View>
            )
            : (
              <>
                <Text style={[typography.body, { color: ui.ink }]}>
                  {cost.files === 0
                    ? t('maps.nothingToDo')
                    : measured === null
                    ? t('maps.estimateNoTime', {
                      files: cost.files,
                      size: describeSize(cost.bytes),
                    })
                    : t('maps.estimate', {
                      files: cost.files,
                      size: describeSize(cost.bytes),
                      time: describeTime(cost.ms),
                    })}
                </Text>
                {measured === null && cost.files > 0
                  ? (
                    <Text style={[typography.caption, { color: ui.text4 }]}>
                      {t('maps.measureFirst')}
                    </Text>
                  )
                  : null}
                {cost.files > fits
                  ? (
                    <Text style={[typography.caption, { color: ui.text4 }]}>
                      {t('maps.willNotFit', { files: fits })}
                    </Text>
                  )
                  : null}
                {cost.ms > 10 * 60000
                  ? (
                    <Text style={[typography.caption, { color: ui.text4 }]}>
                      {t('maps.charger')}
                    </Text>
                  )
                  : null}
              </>
            )}

          {!running && total > 0
            ? (
              <Text style={[typography.caption, { color: ui.text4 }]}>
                {t(wasStopped ? 'maps.stoppedEarly' : 'maps.finished', {
                  done,
                })}
                {failed > 0 ? ` ${t('maps.someFailed', { failed })}` : ''}
              </Text>
            )
            : null}

          {held === null
            ? null
            : (
              <Text
                style={[typography.caption, styles.held, { color: ui.text4 }]}
              >
                {t('maps.held', { size: describeSize(held) })}
              </Text>
            )}
          {note === null
            ? null
            : (
              <Text style={[typography.caption, { color: ui.text4 }]}>
                {note}
              </Text>
            )}

          <View style={styles.buttons}>
            {running
              ? (
                <Button mode="contained" onPress={stopPrecompute}>
                  {t('maps.stop')}
                </Button>
              )
              : (
                <Button
                  mode="contained"
                  onPress={start}
                  disabled={cost.files === 0}
                >
                  {t('maps.start')}
                </Button>
              )}
            <Button
              mode="text"
              onPress={() => {
                void forget();
              }}
              disabled={running || held === null || held === 0}
            >
              {t('maps.forget')}
            </Button>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

/**
 * Where the calendar is now, in UTC.
 *
 * The plan counts months and hours from here, and the engine's own
 * months are UTC ones.
 */
function startOfNow() {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    hour: now.getUTCHours(),
  };
}

/**
 * This device's measured speed in milliseconds a grid point, or null.
 *
 * Its own hook so the import of the device store stays out of the body
 * above, and so the "not measured yet" case is one value rather than a
 * chain of checks at every place the estimate is drawn.
 */
function useDeviceMeasurement(): number | null {
  const measured = useDeviceStore((state) => state.measured);
  return measured === null || !Number.isFinite(measured.pointMs)
    ? null
    : measured.pointMs;
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
  heading: { marginTop: spacing.md, marginBottom: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.inset,
    borderWidth: 1,
  },
  divider: { marginVertical: spacing.md },
  bar: { marginVertical: spacing.sm },
  held: { marginTop: spacing.sm },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
});
