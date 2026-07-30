import Slider from '@react-native-community/slider';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  IconButton,
  Modal,
  Portal,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import {
  alignment,
  askedAsWire,
  beamFromWire,
  isBidirectional,
  lobes,
  nearestLobe,
  offAxis,
  wireFromBeam,
} from '../data/orientation';
import { parsePower, positionOf, POWER_STEPS, wattsAt } from '../data/power';
import { parseTypedNumber } from '../data/typedNumber';
import { useUnits } from '../hooks/useUnits';
import {
  activePreset,
  ANTENNA_ORDER,
  type AntennaKey,
  LIMITS,
  MAX_NAME_LENGTH,
  MODE_ORDER,
  type ModeKey,
  usesBeam,
  usesGain,
  usesHeight,
  useStationStore,
} from '../store/useStationStore';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import CompassRose from './CompassRose';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /**
   * Bearing to the other end, degrees true, when a prediction is loaded.
   * Offers the one heading an operator actually wants for a beam, so it
   * does not have to be looked up and typed.
   */
  bearingToDestination?: number;
  /** Name of the other end, for the label on that button. */
  destinationLabel?: string;
  /**
   * The threshold the current forecast was actually computed at, as the
   * server reported it. Shown rather than derived, so the modal cannot
   * name one number while the grid was worked out from another.
   *
   * Undefined when there is no forecast — this modal opens from the error
   * screen too, so that power, mode and the antenna can still be set. The
   * threshold line is then left out rather than guessed: the app holds no
   * copy of the mode table, and a number invented here could disagree with
   * the one the server uses.
   */
  requiredSnrDb?: number;
}

/**
 * The radio: power, mode and antenna, under a name.
 *
 * These three used to be fixed at 100 W, a CW threshold and an isotropic
 * antenna, and nothing said so. They are here rather than in the theme
 * and language menu because they are not preferences about the display —
 * they change what the forecast says.
 *
 * Modes are listed hardest first, so the list itself reads as the ranking
 * it is: choosing FT8 over SSB is worth about 25 dB, which is the
 * difference between a closed path and a workable one.
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
  const units = useUnits();
  const ui = theme.colors.ui;

  const presets = useStationStore((s) => s.presets);
  const activeId = useStationStore((s) => s.activeId);
  const setWatts = useStationStore((s) => s.setWatts);
  const setMode = useStationStore((s) => s.setMode);
  const setAntenna = useStationStore((s) => s.setAntenna);
  const rename = useStationStore((s) => s.rename);
  const addPreset = useStationStore((s) => s.addPreset);
  const removePreset = useStationStore((s) => s.removePreset);
  const reset = useStationStore((s) => s.reset);

  const setEditing = useStationStore((s) => s.setEditing);

  const preset = activePreset({ presets, activeId });
  const { watts, mode, antenna } = preset;

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

  /**
   * The power field while it is being typed.
   *
   * Held apart from the store so a half-typed "0." is not parsed, clamped
   * and written back under the reader's fingers. Null means nothing is
   * being typed and the field shows the stored value, which is also how
   * it follows the slider.
   */
  const [typedPower, setTypedPower] = useState<string | null>(null);

  /**
   * The antenna height while it is being typed, for the same reason.
   *
   * Height was a slider alone, on the argument that a mast is "about ten
   * metres" rather than 10.0. That is true of guessing and false of knowing:
   * someone who has measured their mast should be able to say so, and dragging
   * a slider to a particular metre is fiddly on a phone.
   */
  const [typedHeight, setTypedHeight] = useState<string | null>(null);

  // The control moves in whole feet or whole metres, whichever the reader
  // uses, so a step never lands on a converted fraction.
  const heightScale = units.heightScale(LIMITS.heightM);

  // What the orientation control holds: the run of the wire for a dipole,
  // the bearing itself for anything else. The store always keeps VOACAP's
  // main-beam bearing, so the conversion lives here and nowhere else.
  const control = askedAsWire(antenna.type)
    ? wireFromBeam(antenna.beamDeg)
    : antenna.beamDeg;
  const facing = lobes(antenna.beamDeg, antenna.type).map(Math.round);
  const offset = bearingToDestination === undefined
    ? undefined
    : offAxis(antenna.beamDeg, antenna.type, bearingToDestination);

  const heading = (text: string) => (
    <Text style={[typography.label, styles.heading, { color: ui.text4 }]}>
      {text}
    </Text>
  );

  const chip = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
    a11y: string,
  ) => (
    <TouchableRipple
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
      style={[styles.chip, {
        backgroundColor: selected ? ui.accent : ui.card,
        borderColor: selected ? ui.accent : ui.line,
      }]}
    >
      <Text
        style={[typography.bodyStrong, {
          color: selected ? ui.accentInk : ui.text2,
        }]}
      >
        {label}
      </Text>
    </TouchableRipple>
  );

  /**
   * A labelled slider. Sliders rather than typed numbers for the antenna,
   * because those are rough figures an operator knows approximately — a
   * mast is "about ten metres", not 10.0 — and because a number pad on a
   * phone covers the value being set. Power gets both, since a rig has an
   * exact setting worth typing.
   */
  const dial = (
    label: string,
    value: string,
    current: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
    a11yLabel: string,
  ) => (
    <View style={styles.dial}>
      <View style={styles.dialRow}>
        <Text style={[typography.body, { color: ui.text2 }]}>{label}</Text>
        <Text style={[typography.bodyStrong, numeric, { color: ui.ink }]}>
          {value}
        </Text>
      </View>
      <Slider
        value={current}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        minimumTrackTintColor={ui.accent}
        maximumTrackTintColor={ui.line2}
        thumbTintColor={ui.accent}
        accessibilityLabel={a11yLabel}
        accessibilityValue={{ min, max, now: current }}
      />
    </View>
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
          {
            /* The name comes first, because everything below it belongs to
               this one station. A licence does not come with one radio: a
               base with a beam and a portable with a wire give different
               answers, and both are true. */
          }
          {heading(t('station.nameSection'))}
          <TextInput
            mode="outlined"
            dense
            value={preset.name}
            placeholder={t('station.unnamed')}
            maxLength={MAX_NAME_LENGTH}
            onChangeText={rename}
            accessibilityLabel={t('station.a11y.name')}
            style={styles.field}
          />
          <View style={styles.presetActions}>
            <Button
              mode="outlined"
              icon="plus"
              onPress={addPreset}
              accessibilityHint={t('station.a11y.addHint')}
            >
              {t('station.add')}
            </Button>
            <Button
              mode="text"
              icon="delete-outline"
              onPress={() => removePreset(activeId)}
              disabled={presets.length <= 1}
            >
              {t('station.remove')}
            </Button>
          </View>

          {heading(t('station.modeSection'))}
          <Text style={[typography.caption, styles.hint, { color: ui.text3 }]}>
            {t('station.modeHint')}
          </Text>
          <View style={styles.chipRow}>
            {MODE_ORDER.map((value: ModeKey) =>
              chip(
                value,
                t(`station.mode.${value}`),
                value === mode,
                () => setMode(value),
                t('station.a11y.pickMode', {
                  mode: t(`station.mode.${value}`),
                }),
              )
            )}
          </View>
          {requiredSnrDb === undefined
            ? null
            : (
              <Text
                style={[typography.caption, styles.note, { color: ui.text3 }]}
              >
                {t('station.modeNeeds', {
                  mode: t(`station.mode.${mode}`),
                  db: requiredSnrDb,
                })}
              </Text>
            )}

          {heading(t('station.powerSection'))}
          {
            /* Typed as well as swept. A rig has an exact setting worth
               entering, and the slider is logarithmic because the range
               runs over four decades — a linear one would spend nine
               tenths of its travel above 150 W and never reach a QRP
               setting at all. */
          }
          <TextInput
            mode="outlined"
            dense
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={typedPower ?? String(watts)}
            onChangeText={(text) => {
              setTypedPower(text);
              const parsed = parsePower(text);
              if (parsed !== null) setWatts(parsed);
            }}
            onBlur={() => setTypedPower(null)}
            right={<TextInput.Affix text={t('station.wattsUnit')} />}
            accessibilityLabel={t('station.a11y.power')}
            style={styles.field}
          />
          <Text style={[typography.caption, styles.note, { color: ui.text3 }]}>
            {t('station.powerRange', {
              min: LIMITS.watts.min,
              max: LIMITS.watts.max,
            })}
          </Text>
          <Slider
            value={positionOf(watts, LIMITS.watts)}
            minimumValue={0}
            maximumValue={POWER_STEPS}
            step={1}
            onValueChange={(position) => {
              setTypedPower(null);
              setWatts(wattsAt(position, LIMITS.watts));
            }}
            minimumTrackTintColor={ui.accent}
            maximumTrackTintColor={ui.line2}
            thumbTintColor={ui.accent}
            accessibilityLabel={t('station.a11y.power')}
            accessibilityValue={{
              min: LIMITS.watts.min,
              max: LIMITS.watts.max,
              now: watts,
            }}
          />

          {heading(t('station.antennaSection'))}
          <View style={styles.chipRow}>
            {ANTENNA_ORDER.map((value: AntennaKey) =>
              chip(
                value,
                t(`station.antenna.${value}`),
                value === antenna.type,
                () => setAntenna({ type: value }),
                t('station.a11y.pickAntenna', {
                  antenna: t(`station.antenna.${value}`),
                }),
              )
            )}
          </View>

          {usesHeight(antenna.type)
            ? (
              <>
                {
                  /* Typed as well as swept, like the power above it. Height
                     moves a 20 m path by about 9 dB, so someone who knows their
                     mast should be able to enter it rather than hunt for the
                     metre with a fingertip. The field is in the reader's own
                     unit, which is what the affix names. */
                }
                <TextInput
                  mode="outlined"
                  dense
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  value={typedHeight
                    ?? String(units.heightFromMetres(antenna.heightM))}
                  onChangeText={(text) => {
                    setTypedHeight(text);
                    const parsed = parseTypedNumber(text);
                    if (parsed !== null) {
                      setAntenna({ heightM: units.heightToMetres(parsed) });
                    }
                  }}
                  onBlur={() => setTypedHeight(null)}
                  right={
                    <TextInput.Affix
                      text={units.system === 'metric'
                        ? t('station.metresUnit')
                        : t('station.feetUnit')}
                    />
                  }
                  accessibilityLabel={t('station.a11y.height')}
                  style={styles.field}
                />
                <Text
                  style={[typography.caption, styles.note, { color: ui.text3 }]}
                >
                  {t('station.heightRange', {
                    min: heightScale.min,
                    max: heightScale.max,
                  })}
                </Text>
                {dial(
                  t('station.height'),
                  units.height(antenna.heightM),
                  units.heightFromMetres(antenna.heightM),
                  heightScale.min,
                  heightScale.max,
                  heightScale.step,
                  (value) => {
                    // The slider is the authority again once it moves, so the
                    // field stops showing what was typed.
                    setTypedHeight(null);
                    setAntenna({ heightM: units.heightToMetres(value) });
                  },
                  t('station.a11y.height'),
                )}
              </>
            )
            : (
              <Text
                style={[typography.caption, styles.note, { color: ui.text3 }]}
              >
                {t('station.isotropicNote')}
              </Text>
            )}

          {usesHeight(antenna.type)
            ? (
              <Text
                style={[typography.caption, styles.note, { color: ui.text3 }]}
              >
                {t('station.heightNote')}
              </Text>
            )
            : null}

          {usesGain(antenna.type)
            ? dial(
              t('station.gain'),
              t('station.dbd', { gain: antenna.gainDbd }),
              antenna.gainDbd,
              LIMITS.gainDbd.min,
              LIMITS.gainDbd.max,
              0.5,
              (gainDbd) => setAntenna({ gainDbd }),
              t('station.a11y.gain'),
            )
            : null}

          {
            /* A vertical is the only family with nothing to point.
               Measured at 0 dB over the whole compass, so saying so is
               true, and it stops the missing control reading as a gap. */
          }
          {antenna.type === 'vertical'
            ? (
              <Text
                style={[typography.caption, styles.note, { color: ui.text3 }]}
              >
                {t('station.verticalNote')}
              </Text>
            )
            : null}

          {usesBeam(antenna.type)
            ? (
              <>
                {
                  /* A wire is described by how it runs, a beam by where it
                     points. Asking a dipole owner for its "beam heading"
                     asks them to do the right-angle conversion in their
                     head, and getting it wrong puts the path in the null.
                     Turning a dipole through the compass is worth 12 dB
                     and takes reliability from 7% to 71%. */
                }
                {dial(
                  askedAsWire(antenna.type)
                    ? t('station.wireRuns')
                    : t('station.beam'),
                  t('station.degrees', { degrees: control }),
                  control,
                  0,
                  359,
                  1,
                  (value) =>
                    setAntenna({
                      beamDeg: askedAsWire(antenna.type)
                        ? beamFromWire(value)
                        : value,
                    }),
                  askedAsWire(antenna.type)
                    ? t('station.a11y.wire')
                    : t('station.a11y.beam'),
                )}

                {
                  /* Drawn as well as described. The sentence below used to
                     say a path was "80° off your best direction" without
                     ever saying which direction that was, and for a wire
                     it is not the number above either — it is the pair at
                     right angles to it. The picture states both, and the
                     degree figures on it are the ones in the sentences. */
                }
                <CompassRose
                  beamDeg={antenna.beamDeg}
                  type={antenna.type}
                  pathDeg={bearingToDestination}
                />

                <Text
                  style={[typography.caption, styles.note, { color: ui.text3 }]}
                >
                  {isBidirectional(antenna.type)
                    ? t('station.favoursTwo', {
                      first: facing[0],
                      second: facing[1],
                    })
                    : t('station.favoursOne', { first: facing[0] })}
                </Text>

                {bearingToDestination === undefined ? null : (
                  <>
                    <Text
                      style={[typography.caption, styles.note, {
                        color: ui.text3,
                      }]}
                    >
                      {t(`station.aim.${alignment(offset ?? 0)}`, {
                        place: destinationLabel ?? '',
                        degrees: Math.round(bearingToDestination),
                        offset: Math.round(offset ?? 0),
                        lobe: Math.round(
                          nearestLobe(
                            antenna.beamDeg,
                            antenna.type,
                            bearingToDestination,
                          ),
                        ),
                      })}
                    </Text>
                    <Button
                      mode="outlined"
                      icon="crosshairs-gps"
                      style={styles.aim}
                      onPress={() =>
                        setAntenna({
                          beamDeg: Math.round(bearingToDestination),
                        })}
                    >
                      {t(
                        askedAsWire(antenna.type)
                          ? 'station.alignFor'
                          : 'station.aimAt',
                        {
                          place: destinationLabel ?? '',
                          degrees: Math.round(bearingToDestination),
                        },
                      )}
                    </Button>
                  </>
                )}
              </>
            )
            : null}

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
  heading: { marginTop: spacing.lg, marginBottom: spacing.xs },
  hint: { marginBottom: spacing.sm },
  note: { marginTop: spacing.xs },
  field: { marginTop: spacing.xs },
  presetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  // Wraps rather than scrolls: nine modes will not fit one line on a
  // phone, and a hidden mode is a mode nobody picks.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dial: { marginTop: spacing.md },
  dialRow: { flexDirection: 'row', justifyContent: 'space-between' },
  aim: { marginTop: spacing.sm },
  reset: { marginTop: spacing.lg, alignSelf: 'flex-start' },
});
