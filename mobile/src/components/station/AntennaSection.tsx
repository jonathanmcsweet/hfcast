import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { TextInput } from 'react-native-paper';

import {
  effectiveHeightM,
  INVERTED_V_HEIGHT_FRACTION,
} from '../../data/antennaFile';
import { parseTypedNumber } from '../../data/typedNumber';
import { useUnits } from '../../hooks/useUnits';
import {
  ANTENNA_ORDER,
  LIMITS,
  useActivePreset,
  usesGain,
  usesHeight,
  useStationStore,
} from '../../store/useStationStore';
import { spacing } from '../../theme';
import ChipGroup from './ChipGroup';
import Dial from './Dial';
import Note from './Note';
import SectionHeading from './SectionHeading';

/**
 * The antenna: which family, how high, and how much gain.
 *
 * Where it points is the section below this one, because that is the part
 * a path makes an opinion about and the rest is the station alone.
 */
export default function AntennaSection() {
  const { t } = useTranslation();
  const units = useUnits();
  const { antenna } = useActivePreset();
  const setAntenna = useStationStore((s) => s.setAntenna);

  /**
   * The height while it is being typed, for the same reason power is.
   *
   * Height was a slider alone, on the argument that a mast is "about ten
   * metres" rather than 10.0. That is true of guessing and false of
   * knowing: someone who has measured their mast should be able to say
   * so, and dragging a slider to a particular metre is fiddly on a phone.
   */
  const [typedHeight, setTypedHeight] = useState<string | null>(null);

  // The control moves in whole feet or whole metres, whichever the reader
  // uses, so a step never lands on a converted fraction.
  const heightScale = units.heightScale(LIMITS.heightM);

  return (
    <>
      <SectionHeading text={t('station.antennaSection')} />
      <ChipGroup
        options={ANTENNA_ORDER}
        selected={antenna.type}
        onSelect={(type) => setAntenna({ type })}
        label={(value) => t(`station.antenna.${value}`)}
        a11yLabel={(value) =>
          t('station.a11y.pickAntenna', {
            antenna: t(`station.antenna.${value}`),
          })}
      />

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
            <Note>
              {t('station.heightRange', {
                min: heightScale.min,
                max: heightScale.max,
              })}
            </Note>
            <Dial
              // An inverted V has no single height: the feed is at the
              // apex and the ends are lower. Asking for "height" would
              // leave the reader guessing which one, so it names the
              // apex — the point they can measure.
              label={antenna.type === 'invertedV'
                ? t('station.apexHeight')
                : t('station.height')}
              value={units.height(antenna.heightM)}
              current={units.heightFromMetres(antenna.heightM)}
              min={heightScale.min}
              max={heightScale.max}
              step={heightScale.step}
              onChange={(value) => {
                // The slider is the authority again once it moves, so the
                // field stops showing what was typed.
                setTypedHeight(null);
                setAntenna({ heightM: units.heightToMetres(value) });
              }}
              a11yLabel={t('station.a11y.height')}
            />
            <Note>{t('station.heightNote')}</Note>
          </>
        )
        : <Note>{t('station.isotropicNote')}</Note>}

      {
        /* Said here as well as in the help, because this is where the
           number is entered and the number entered is not the number
           the model reads. A reader comparing this forecast against
           another tool should be able to see why they differ. */
      }
      {antenna.type === 'invertedV'
        ? (
          <Note>
            {t('station.invertedVNote', {
              height: units.height(effectiveHeightM(antenna)),
              percent: Math.round(INVERTED_V_HEIGHT_FRACTION * 100),
            })}
          </Note>
        )
        : null}

      {usesGain(antenna.type)
        ? (
          <Dial
            label={t('station.gain')}
            value={t('station.dbd', { gain: antenna.gainDbd })}
            current={antenna.gainDbd}
            min={LIMITS.gainDbd.min}
            max={LIMITS.gainDbd.max}
            step={0.5}
            onChange={(gainDbd) => setAntenna({ gainDbd })}
            a11yLabel={t('station.a11y.gain')}
          />
        )
        : null}

      {
        /* A vertical is the only family with nothing to point.
           Measured at 0 dB over the whole compass, so saying so is
           true, and it stops the missing control reading as a gap. */
      }
      {antenna.type === 'vertical'
        ? <Note>{t('station.verticalNote')}</Note>
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.xs },
});
