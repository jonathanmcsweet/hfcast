import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { TextInput, useTheme } from 'react-native-paper';

import { parsePower, positionOf, POWER_STEPS, wattsAt } from '../../data/power';
import {
  useDraftField,
  useStationDraftStore,
} from '../../store/useStationDraftStore';
import { LIMITS } from '../../store/useStationStore';
import { spacing } from '../../theme';
import type { AppTheme } from '../../theme';
import Note from './Note';
import SectionHeading from './SectionHeading';

/**
 * The power, typed as well as swept.
 *
 * A rig has an exact setting worth entering, and the slider is
 * logarithmic because the range runs over four decades — a linear one
 * would spend nine tenths of its travel above 150 W and never reach a QRP
 * setting at all.
 */
export default function PowerSection() {
  const { t } = useTranslation();
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;
  const watts = useDraftField((preset) => preset.watts);
  const setWatts = useStationDraftStore((s) => s.setWatts);

  /**
   * The field while it is being typed.
   *
   * Held apart from the store so a half-typed "0." is not parsed, clamped
   * and written back under the reader's fingers. Null means nothing is
   * being typed and the field shows the stored value, which is also how
   * it follows the slider.
   */
  const [typed, setTyped] = useState<string | null>(null);

  /**
   * Where the slider is while it is being dragged. Null when it is not.
   *
   * A slider reports every step it passes through, and each of those
   * used to change the station being edited. The field above follows the
   * drag from here instead, and the station is set once, when the finger
   * lifts.
   */
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging === null
    ? watts
    : wattsAt(dragging, LIMITS.watts);

  return (
    <>
      <SectionHeading text={t('station.powerSection')} />
      <TextInput
        mode="outlined"
        dense
        keyboardType="decimal-pad"
        inputMode="decimal"
        value={typed ?? String(shown)}
        onChangeText={(text) => {
          setTyped(text);
          const parsed = parsePower(text);
          if (parsed !== null) setWatts(parsed);
        }}
        onBlur={() => setTyped(null)}
        right={<TextInput.Affix text={t('station.wattsUnit')} />}
        accessibilityLabel={t('station.a11y.power')}
        style={styles.field}
      />
      <Note>
        {t('station.powerRange', {
          min: LIMITS.watts.min,
          max: LIMITS.watts.max,
        })}
      </Note>
      <Slider
        value={positionOf(watts, LIMITS.watts)}
        minimumValue={0}
        maximumValue={POWER_STEPS}
        step={1}
        onValueChange={(position) => {
          setTyped(null);
          setDragging(position);
        }}
        onSlidingComplete={(position) => {
          setDragging(null);
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
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.xs },
});
