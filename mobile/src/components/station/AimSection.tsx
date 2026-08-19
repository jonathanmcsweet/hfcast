import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

import {
  alignment,
  askedAsWire,
  beamFromWire,
  isBidirectional,
  lobes,
  nearestLobe,
  offAxis,
  wireFromBeam,
} from '../../data/orientation';
import {
  useDraftField,
  useStationDraftStore,
} from '../../store/useStationDraftStore';
import { usesBeam } from '../../store/useStationStore';
import { spacing } from '../../theme';
import CompassRose from '../CompassRose';
import Dial from './Dial';
import Note from './Note';

/**
 * Where the antenna points, and whether that suits the path.
 *
 * A wire is described by how it runs, a beam by where it points. Asking a
 * dipole owner for its "beam heading" asks them to do the right-angle
 * conversion in their head, and getting it wrong puts the path in the
 * null. Turning a dipole through the compass is worth 12 dB and takes
 * reliability from 7% to 71%.
 *
 * Nothing is drawn for a family with nothing to point.
 */
export default function AimSection(
  { bearingToDestination, destinationLabel }: {
    /** Bearing to the other end, degrees true, when a prediction is loaded. */
    bearingToDestination?: number | undefined;
    /** Name of the other end, for the label on that button. */
    destinationLabel?: string | undefined;
  },
) {
  const { t } = useTranslation();
  const antenna = useDraftField((preset) => preset.antenna);
  const setAntenna = useStationDraftStore((s) => s.setAntenna);

  if (!usesBeam(antenna.type)) return null;

  // What the control holds: the run of the wire for a dipole, the bearing
  // itself for anything else. The store always keeps VOACAP's main-beam
  // bearing, so the conversion lives here and nowhere else.
  const asWire = askedAsWire(antenna.type);
  const control = asWire ? wireFromBeam(antenna.beamDeg) : antenna.beamDeg;
  const facing = lobes(antenna.beamDeg, antenna.type).map(Math.round);
  const offset = bearingToDestination === undefined
    ? undefined
    : offAxis(antenna.beamDeg, antenna.type, bearingToDestination);

  return (
    <>
      <Dial
        label={asWire ? t('station.wireRuns') : t('station.beam')}
        value={t('station.degrees', { degrees: control })}
        current={control}
        min={0}
        max={359}
        step={1}
        onChange={(value) =>
          setAntenna({ beamDeg: asWire ? beamFromWire(value) : value })}
        a11yLabel={asWire ? t('station.a11y.wire') : t('station.a11y.beam')}
      />

      {
        /* Drawn as well as described. The sentence below used to say a
           path was "80° off your best direction" without ever saying
           which direction that was, and for a wire it is not the number
           above either — it is the pair at right angles to it. The
           picture states both, and the degree figures on it are the ones
           in the sentences. */
      }
      <CompassRose
        beamDeg={antenna.beamDeg}
        type={antenna.type}
        pathDeg={bearingToDestination}
      />

      <Note>
        {isBidirectional(antenna.type)
          ? t('station.favoursTwo', { first: facing[0], second: facing[1] })
          : t('station.favoursOne', { first: facing[0] })}
      </Note>

      {bearingToDestination === undefined ? null : (
        <>
          <Note>
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
          </Note>
          <Button
            mode="outlined"
            icon="crosshairs-gps"
            style={styles.aim}
            onPress={() =>
              setAntenna({ beamDeg: Math.round(bearingToDestination) })}
          >
            {t(asWire ? 'station.alignFor' : 'station.aimAt', {
              place: destinationLabel ?? '',
              degrees: Math.round(bearingToDestination),
            })}
          </Button>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  aim: { marginTop: spacing.sm },
});
