import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';

import { CARDINALS, CENTRE, point, RING, TICKS, wedge } from '../data/compass';
import { askedAsWire, lobes, wireFromBeam } from '../data/orientation';
import type { AntennaKey } from '../store/useStationStore';
import type { AppTheme } from '../theme';

/**
 * Where this antenna is strong, drawn on a compass.
 *
 * The words alone were not enough. "Eighty degrees off your best
 * direction" names an offset from a direction the reader was never told,
 * and for a dipole it is not even the number they set: they gave the run
 * of the wire, and the antenna favours the two directions at right angles
 * to it. Drawing it answers the question the sentence raised — the
 * shaded wedges are the strong directions, the dashed arrow is the path,
 * and the gap between them is the offset.
 *
 * Every fact here is also written underneath in words, with the same
 * degree figures, so nothing depends on seeing this and the two are
 * linked by number rather than by colour.
 */

interface Props {
  /** VOACAP's main beam bearing, degrees true, as the store holds it. */
  beamDeg: number;
  type: AntennaKey;
  /** Bearing to the other end, when a prediction is loaded. */
  pathDeg?: number;
  size?: number;
}

export default function CompassRose(
  { beamDeg, type, pathDeg, size = 168 }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const facing = lobes(beamDeg, type);
  const wireDeg = wireFromBeam(beamDeg);

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      /* The sentences below carry all of this in words. Read out as well,
         it would be the same information twice. */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle
          cx={CENTRE}
          cy={CENTRE}
          r={RING}
          fill="none"
          stroke={ui.line}
          strokeWidth={1}
        />

        {TICKS.map((deg) => {
          const long = deg % 90 === 0;
          const outer = point(deg, RING);
          const inner = point(deg, RING - (long ? 6 : 3));
          return (
            <Line
              key={`tick-${deg}`}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke={long ? ui.line2 : ui.line}
              strokeWidth={long ? 1.2 : 0.8}
            />
          );
        })}

        {CARDINALS.map(({ deg, key }) => {
          const at = point(deg, RING + 7);
          return (
            <SvgText
              key={`cardinal-${key}`}
              x={at.x}
              y={at.y + 2.6}
              fontSize={7.5}
              fill={ui.text3}
              textAnchor="middle"
            >
              {t(`station.compass.${key}`)}
            </SvgText>
          );
        })}

        {
          /* The wire itself, for the one family described by its run. It
             is what the reader set, and seeing it at right angles to the
             wedges is the point that words keep failing to make. */
        }
        {askedAsWire(type)
          ? (
            <Line
              x1={point(wireDeg, RING - 4).x}
              y1={point(wireDeg, RING - 4).y}
              x2={point(wireDeg + 180, RING - 4).x}
              y2={point(wireDeg + 180, RING - 4).y}
              stroke={ui.text3}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          )
          : null}

        {facing.map((deg) => (
          <Path
            key={`lobe-${deg}`}
            d={wedge(deg, RING - 8)}
            fill={ui.accent}
            fillOpacity={0.22}
            stroke={ui.accent}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        ))}

        {facing.map((deg) => {
          const at = point(deg, RING - 19);
          return (
            <SvgText
              key={`lobe-label-${deg}`}
              x={at.x}
              y={at.y + 2.4}
              fontSize={7}
              fill={ui.ink}
              textAnchor="middle"
            >
              {t('station.degrees', { degrees: Math.round(deg) })}
            </SvgText>
          );
        })}

        {
          /* The path, drawn last so it stays readable over a wedge. It is
             the only line with an arrow on it, which is what tells it
             apart from the wire without relying on colour. */
        }
        {pathDeg === undefined
          ? null
          : (
            <G rotation={pathDeg} originX={CENTRE} originY={CENTRE}>
              <Line
                x1={CENTRE}
                y1={CENTRE}
                x2={CENTRE}
                y2={CENTRE - RING + 1}
                stroke={ui.ink}
                strokeWidth={1.2}
                strokeDasharray="3 2.5"
              />
              <Polygon
                points={[
                  `${CENTRE},${CENTRE - RING - 3}`,
                  `${CENTRE - 3.4},${CENTRE - RING + 3}`,
                  `${CENTRE + 3.4},${CENTRE - RING + 3}`,
                ].join(' ')}
                fill={ui.ink}
              />
            </G>
          )}

        <Circle cx={CENTRE} cy={CENTRE} r={1.6} fill={ui.text3} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
});
