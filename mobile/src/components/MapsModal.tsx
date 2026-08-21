import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Divider,
  Icon,
  ProgressBar,
  Switch,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { BAND_ORDER } from '../../../shared/bands';
import * as Engine from '../../modules/engine-bridge';
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
import ModalFrame from './ModalFrame';

/**
 * Computing maps before they are needed, and the room they take.
 *
 * The screen for the case the feature exists for: at home, on a charger,
 * setting up for a day out with no network.
 *
 * What it shows before anything runs is the point. A whole year of every
 * band is about 190 MB and over an hour of work, which has to be a choice
 * rather than a surprise, so the size and the time are worked out from
 * what this device measured about itself — never a fast one.
 */
interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/** A megabyte, as the sizes here are counted. */
const MB = 1024 * 1024;

/**
 * A size a person can read. `MB` is not translated: it is written the
 * same way in every language this app ships, and a translated
 * abbreviation would be less recognisable.
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
  const engineModel = useSettingsStore((state) => state.engineModel);
  const setBands = useSettingsStore((state) => state.setPrecomputeBands);
  const budgetMb = useSettingsStore((state) => state.mapBudgetMb);
  const onCharger = useSettingsStore((state) => state.precomputeOnCharger);
  const setOnCharger = useSettingsStore(
    (state) => state.setPrecomputeOnCharger,
  );
  const setBudgetMb = useSettingsStore((state) => state.setMapBudgetMb);

  const running = usePrecomputeStore((state) => state.running);
  const waiting = usePrecomputeStore((state) => state.waiting);
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
      engine: engineModel,
      bands,
      months,
      budgetBytes: budgetMb * MB,
    }),
    [from, station, engineModel, bands, months, budgetMb],
  );

  // The room in use and the work left, read when the dialog opens, when
  // the choice changes, and when a job stops. Not while one runs: the
  // directory would be listed over and over, and the progress line is
  // what matters then. The work left comes from the job rather than the
  // calendar, so it counts the grids that will really be computed.
  useEffect(() => {
    if (!visible || running) return;
    // The one mutable value here, and it never leaves this closure. Two
    // reads are in flight and the modal can close before either answers,
    // which without this sets state on a screen that has gone.
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

  const start = async () => {
    setNote(null);
    setLeft(null);
    // Asked for here rather than at boot, so the reason for it is the
    // screen behind it. Whatever comes back, the job runs: a refusal
    // costs the progress notification and its Stop button, not the work.
    await Engine.askToNotify();
    // The words the notification shows are handed over here, because
    // this is the side that has languages. See `PrecomputeLabels`.
    void precompute(ask, {
      title: t('maps.notifyTitle'),
      stop: t('maps.stop'),
      progress: (done, total) => t('maps.notifyProgress', { done, total }),
      waiting: t('maps.waitingTitle'),
    });
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
    <ModalFrame
      visible={visible}
      onDismiss={onDismiss}
      title={t('maps.title')}
      leave={running ? 'none' : 'close'}
    >
      {
        /* Outside the scroll, so it cannot be the thing nobody scrolled
             to. A job that is waiting looks exactly like a job that has
             stalled, and the first person to see this state read it as
             one and did not find the line saying otherwise (user,
             2026-08-12). So it is a band of colour at the top rather than
             a caption in the middle, and it names the switch that ends
             the wait rather than only reporting it. */
      }
      {running && waiting
        ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.banner, { backgroundColor: ui.amberBg }]}
          >
            <Icon source="power-plug-off" size={20} color={ui.amberFg} />
            <View style={styles.bannerText}>
              <Text
                style={[typography.bodyStrong, { color: ui.amberFg }]}
              >
                {t('maps.waitingTitle')}
              </Text>
              {
                /* The switch is named by asking for its own label
                     rather than by repeating the words, so renaming it
                     cannot leave this sentence pointing at something
                     that is no longer called that. */
              }
              <Text style={[typography.caption, { color: ui.amberFg }]}>
                {t('maps.waitingForCharger', {
                  setting: t('maps.onCharger'),
                })}
              </Text>
            </View>
          </View>
        )
        : null}

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

        {
          /* Off means the job runs on battery. It is offered rather
               than fixed because a person at home with the tablet on a
               desk is the case this feature was built for, and a person
               in a field with a power bank is a case it should not
               refuse. The default protects the battery somebody will
               want for the radio.

               Unlike every other choice here it stays live while a job
               runs, because the moment somebody wants it is the moment
               they find the job waiting for a charger they have not got.
               Turning it off then does not wait for the next map to
               finish — see `waitForCharger`, which reads this on every
               pass. */
        }
        <View style={styles.toggleRow}>
          <Text
            style={[typography.body, styles.toggleText, { color: ui.ink }]}
          >
            {t('maps.onCharger')}
          </Text>
          <Switch
            value={onCharger}
            onValueChange={setOnCharger}
            accessibilityLabel={t('maps.onCharger')}
          />
        </View>
        {onCharger ? null : (
          <Text
            style={[typography.caption, styles.note, { color: ui.text3 }]}
          >
            {t('maps.batteryNote')}
          </Text>
        )}

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
              {
                /* The month, hour and band last computed. Kept while
                     the job waits for a charger, because it is then the
                     answer to "where will it pick up". The banner above
                     already says why nothing is moving. */
              }
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
                onPress={() => {
                  void start();
                }}
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
    </ModalFrame>
  );
}

/**
 * Where the calendar is now, in UTC. The plan counts months and hours
 * from here, and the engine's months are UTC ones.
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
 * Its own hook, so "not measured yet" is one value rather than a chain of
 * checks everywhere the estimate is drawn.
 */
function useDeviceMeasurement(): number | null {
  const measured = useDeviceStore((state) => state.measured);
  return measured === null || !Number.isFinite(measured.pointMs)
    ? null
    : measured.pointMs;
}

const styles = StyleSheet.create({
  heading: { marginTop: spacing.md, marginBottom: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.inset,
    borderWidth: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.inset,
  },
  bannerText: { flex: 1, gap: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    marginTop: spacing.sm,
  },
  toggleText: { flex: 1 },
  note: { marginTop: spacing.xs },
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
