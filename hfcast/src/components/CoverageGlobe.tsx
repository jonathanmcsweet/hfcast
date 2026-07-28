import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, G, Path } from 'react-native-svg';

import land from '../assets/land.json';
import {
  cellRing,
  circleAround,
  EARTH_KM,
  greatCircle,
  pathOf,
  projector,
  projectRing,
  subsolarPoint,
} from '../data/projection';
import { qualityFor } from '../data/quality';
import type { Coverage, Endpoint } from '../data/types';
import { qualityMap, radius as radii, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** Undefined while loading, null when the request failed. */
  coverage: Coverage | null | undefined;
  from: Endpoint;
  /** Drawn as a great circle from the centre. */
  to: Endpoint | null;
  /** UTC hour the terminator is drawn for. */
  hour: number;
  size: number;
}

/** Dashed rings, in kilometres. The spacing operators think in. */
const RING_KM = [1000, 2000, 4000, 8000, 12000];

const RINGS = land as [number, number][][];

/**
 * The coverage map: where this band reaches, right now, in every direction.
 *
 * Centred on the operator in an azimuthal equidistant projection, so a ring
 * really is a fixed distance, a bearing really is an angle off the page, and
 * the shape of the wash is the answer rather than a decoration. The cost is
 * that the far edge of the disc is the single point opposite the operator,
 * smeared around the rim — which is why the outermost half degree is clipped
 * away rather than drawn.
 *
 * The night side is a shaded circle, not a gradient: the terminator is a
 * real boundary and the bands really do behave differently across it.
 */
export default function CoverageGlobe({
  coverage,
  from,
  to,
  hour,
  size,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const dark = theme.dark;
  const ui = theme.colors.ui;
  // The globe's own spacing of the quality ramp, wider than the grid's:
  // white coastlines over a partial fill compress perceived contrast, and
  // at the grid's spacing the middle two states stop reading as two.
  const ramp = dark ? qualityMap.dark : qualityMap.light;

  const geometry = useMemo(() => {
    const p = projector(from.lon, from.lat, size);

    const cells = (coverage?.points ?? []).map((point) => {
      const ring = cellRing(
        point.lon,
        point.lat,
        coverage?.lonStep ?? 22.5,
        coverage?.latStep ?? 15,
      );
      const runs = projectRing(p, [...ring, ring[0] as [number, number]]);
      // A cell straddling the clip boundary comes back in pieces. Only the
      // whole ones are filled: a fragment closed on itself would be a wedge
      // of colour across a part of the map it does not describe.
      const whole = runs.length === 1 && runs[0] !== undefined
        ? pathOf(runs[0], true)
        : '';
      return {
        key: `${point.lat},${point.lon}`,
        d: whole,
        quality: qualityFor(point.reliability),
      };
    }).filter((cell) => cell.d !== '');

    const coast = RINGS.flatMap((ring) =>
      projectRing(p, ring).map((run) => pathOf(run))
    );

    const distanceRings = RING_KM.map((km) => ({ km, r: km * p.pxPerKm }));

    // Night is the cap centred on the antisolar point — the place where it
    // is local midnight — bounded by the great circle a quarter of the way
    // round the earth from it, which is the terminator.
    const now = new Date();
    now.setUTCHours(hour, 0, 0, 0);
    const [sunLon, sunLat] = subsolarPoint(now);
    const antiLon = ((sunLon + 180 + 540) % 360) - 180;
    const nightRuns = projectRing(
      p,
      circleAround(antiLon, -sunLat, (Math.PI / 2) * EARTH_KM),
    );

    const home = p.project(from.lon, from.lat);
    const target = to ? p.project(to.lon, to.lat) : null;
    const path = to
      ? projectRing(p, greatCircle(from.lon, from.lat, to.lon, to.lat))
        .map((run) => pathOf(run))
      : [];

    return { cells, coast, distanceRings, nightRuns, home, target, path, p };
  }, [coverage, from.lat, from.lon, to, hour, size]);

  const { p } = geometry;

  return (
    <View
      accessible
      accessibilityLabel={coverage
        ? t('a11y.coverage', {
          band: coverage.band,
          percent: Math.round(coverage.reach * 100),
        })
        : t('reach.mapLoading')}
      style={[styles.wrap, {
        width: size,
        height: size,
        backgroundColor: ui.inset,
      }]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* The disc is the whole earth. Nothing is drawn outside it. */}
        <Circle cx={p.cx} cy={p.cy} r={p.radius} fill={ui.card} />

        <G>
          {geometry.cells.map((cell) => (
            <Path
              key={cell.key}
              d={cell.d}
              fill={ramp[cell.quality].fill}
              fillOpacity={ramp[cell.quality].opacity}
            />
          ))}
        </G>

        {/* Night, as a single shaded cap rather than a gradient. */}
        {geometry.nightRuns.map((run) => (
          <Path
            key={`n${run.length}-${run[0]?.[0]}`}
            d={pathOf(run, true)}
            fill={dark ? '#000000' : '#12151F'}
            fillOpacity={dark ? 0.45 : 0.14}
            stroke={dark ? '#AAB2C8' : '#FFFFFF'}
            strokeWidth={0.9}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
          />
        ))}

        {geometry.coast.map((d) => (
          <Path
            key={`c${d}`}
            d={d}
            fill="none"
            stroke={dark ? '#8590AB' : '#FFFFFF'}
            strokeWidth={0.9}
            strokeOpacity={0.9}
          />
        ))}

        {geometry.distanceRings.map((ring) => (
          <Circle
            key={ring.km}
            cx={p.cx}
            cy={p.cy}
            r={ring.r}
            fill="none"
            stroke={dark ? '#AAB2C8' : '#FFFFFF'}
            strokeWidth={0.8}
            strokeDasharray="3 5"
            strokeOpacity={0.55}
          />
        ))}

        {geometry.path.map((d) => (
          <Path
            key={`p${d}`}
            d={d}
            fill="none"
            stroke={ui.amberNum}
            strokeWidth={1.6}
          />
        ))}

        {geometry.target
          ? (
            <Circle
              cx={geometry.target[0]}
              cy={geometry.target[1]}
              r={4}
              fill={ui.card}
              stroke={ui.amberNum}
              strokeWidth={2}
            />
          )
          : null}

        {geometry.home
          ? (
            <Circle
              cx={geometry.home[0]}
              cy={geometry.home[1]}
              r={4.5}
              fill={ui.amberNum}
              stroke={ui.card}
              strokeWidth={1.5}
            />
          )
          : null}

        {/* Drawn last so the rim is a clean edge over everything. */}
        <Circle
          cx={p.cx}
          cy={p.cy}
          r={p.radius - 0.5}
          fill="none"
          stroke={ui.line}
          strokeWidth={1}
        />
      </Svg>

      {coverage === undefined
        ? (
          <View style={styles.overlay}>
            <ActivityIndicator />
          </View>
        )
        : null}
      {coverage === null
        ? (
          <View style={styles.overlay}>
            <Text
              style={[typography.caption, styles.message, {
                color: ui.text3,
              }]}
            >
              {t('reach.mapUnavailable')}
            </Text>
          </View>
        )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    borderRadius: radii.control,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  message: { textAlign: 'center' },
});
