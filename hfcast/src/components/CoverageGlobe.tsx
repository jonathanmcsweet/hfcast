import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanResponder, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';
import Svg, { Circle, G, Path } from 'react-native-svg';

import land from '../assets/land.json';
import {
  cellRing,
  circleAround,
  discRing,
  EARTH_KM,
  greatCircle,
  isNight,
  nightIsInside,
  opposedTo,
  pathOf,
  projector,
  projectRing,
  subsolarPoint,
} from '../data/projection';
import { isNvis, qualityFor } from '../data/quality';
import type { Coverage, CoveragePatch, Endpoint } from '../data/types';
import { qualityMap, radius as radii, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** Undefined while loading, null when the request failed. */
  coverage: Coverage | null | undefined;
  /**
   * The fine grid around the operator, drawn over the coarse one.
   *
   * Undefined while it is still running, and null both when it failed and
   * when there cannot be one — a station near the antimeridian. All three
   * mean the same thing here: draw the coarse map alone.
   */
  patch?: CoveragePatch | null;
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
 * How dark the night cap is drawn.
 *
 * Night is painted over the coverage, so whatever it does to one cell it
 * does to every cell under it. At the original 0.45 the same reliability
 * read as two different colours depending on which side of the terminator
 * it fell — the map contradicted its own scale. These values tint rather
 * than recolour; the dashed terminator does the work of showing where the
 * boundary is, and the legend names both.
 *
 * Light is the higher of the two, set by eye rather than by arithmetic. The
 * same alpha does not read the same over a white card as over a dark one,
 * and 0.07 left the night side barely visible.
 */
const NIGHT_OPACITY = { dark: 0.16, light: 0.18 };

const MIN_SCALE = 1;
/** The design's ceiling. Past this the grid is coarser than the pixels. */
const MAX_SCALE = 10;
const ZOOM_STEP = 1.6;

/**
 * What the map is showing: how far in, and on what.
 *
 * The centre is kept as a fraction of the disc rather than in pixels so a
 * layout change — a rotation, a wider column — does not move the view.
 */
interface MapView {
  scale: number;
  cxF: number;
  cyF: number;
}

const WHOLE_GLOBE: MapView = { scale: MIN_SCALE, cxF: 0.5, cyF: 0.5 };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Keeps the visible window inside the disc.
 *
 * At 1x the window is the whole disc, so the only centre that fits is the
 * middle — which is what stops a drag from sliding the globe off its own
 * frame when there is nothing to pan to. Zoomed in, it stops the edge of
 * the world being dragged into the middle of the card.
 */
const containView = (v: MapView): MapView => {
  const half = 1 / (2 * v.scale);
  return {
    scale: v.scale,
    cxF: clamp(v.cxF, half, 1 - half),
    cyF: clamp(v.cyF, half, 1 - half),
  };
};

/** A drag has to beat this before it takes over, so a tap stays a tap. */
const DRAG_SLOP = 3;

/**
 * Fingers on the map before it moves.
 *
 * One finger belongs to the page. The map fills most of the screen, so
 * claiming a single-finger drag meant a scroll that began over the map panned
 * the map instead — a gesture that reads as "move the list" doing something
 * else entirely, with no way to tell in advance which it would be. Two fingers
 * is the pattern a scrollable map inside a scrollable page usually takes, and
 * it also leaves the single finger free for tapping a square.
 */
const PAN_FINGERS = 2;

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
  patch,
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

    // The box the Fit button frames: every cell this band actually reaches.
    // Closed cells are left out on purpose — they are the part of the map
    // the answer is not about.
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

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
      const run = runs.length === 1 ? runs[0] : undefined;
      const quality = qualityFor(point.reliability);

      if (run !== undefined && quality !== 'closed') {
        for (const [x, y] of run) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      return {
        key: `${point.lat},${point.lon}`,
        d: run === undefined ? '' : pathOf(run, true),
        quality,
      };
    }).filter((cell) => cell.d !== '');

    const reachBox = minX <= maxX
      ? { minX, minY, maxX, maxY }
      : null;

    // The fine grid, drawn the same way and over the top. It covers a
    // rectangle a few cells wide near the centre, so at a whole-globe
    // view it is a smudge; it is worth drawing anyway, because zooming in
    // is what the controls are for and the sentence under the map carries
    // the same fact for anyone who cannot.
    //
    // Deliberately left out of `reachBox`: the Fit button frames where
    // the band reaches, and the patch is a region rather than an answer
    // about reach. Including it would pull the frame toward home on every
    // band, whatever the band actually did.
    const patchCells = (patch?.points ?? []).map((point) => {
      const ring = cellRing(
        point.lon,
        point.lat,
        patch?.lonStep ?? 1.5,
        patch?.latStep ?? 1.25,
      );
      const runs = projectRing(p, [...ring, ring[0] as [number, number]]);
      const run = runs.length === 1 ? runs[0] : undefined;
      return {
        key: `p${point.lat},${point.lon}`,
        d: run === undefined ? '' : pathOf(run, true),
        quality: qualityFor(point.reliability),
      };
    }).filter((cell) => cell.d !== '');

    // The stipple, as points rather than as a property of a cell: a point
    // beyond the clip boundary projects to nothing, and that is a
    // different question from whether its cell could be drawn.
    const nvisDots = (patch?.points ?? [])
      .filter((point) => isNvis(point.takeoffAngleDeg, point.reliability))
      .map((point) => ({
        key: `n${point.lat},${point.lon}`,
        at: p.project(point.lon, point.lat),
      }))
      .flatMap(({ key, at }) => at === null ? [] : [{ key, at }]);

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
    // One closed curve is the normal case. It only breaks into pieces when
    // the terminator passes within half a degree of the point opposite the
    // operator, and a broken curve cannot be filled — that is drawn as a
    // line alone rather than as a guess.
    const terminator = nightRuns.length === 1 ? nightRuns[0] : undefined;
    const nightInside = terminator === undefined
      ? true
      : nightIsInside(
        terminator,
        p.cx,
        p.cy,
        isNight(from.lon, from.lat, now),
      );
    // When night is the outer region, the fill is the whole disc with the
    // lit part cut out of it. The two rings are wound opposite ways so the
    // cut works under either fill rule.
    const nightFill = terminator === undefined
      ? ''
      : nightInside
      ? pathOf(terminator, true)
      : (() => {
        const rim = discRing(p.cx, p.cy, p.radius);
        return `${pathOf(rim, true)} ${
          pathOf(opposedTo(terminator, rim), true)
        }`;
      })();

    const home = p.project(from.lon, from.lat);
    const target = to ? p.project(to.lon, to.lat) : null;
    const path = to
      ? projectRing(p, greatCircle(from.lon, from.lat, to.lon, to.lat))
        .map((run) => pathOf(run))
      : [];

    return {
      cells,
      patchCells,
      nvisDots,
      coast,
      distanceRings,
      nightRuns,
      terminator,
      nightFill,
      home,
      target,
      path,
      p,
      reachBox,
    };
  }, [coverage, patch, from.lat, from.lon, to, hour, size]);

  const { p } = geometry;

  const [view, setView] = useState<MapView>(WHOLE_GLOBE);

  // A stroke is drawn after the viewBox scales everything, so a 1px line at
  // 4x would come out 4px thick. Every width, dash and marker radius is
  // divided by the scale to hold its size on screen.
  const px = (n: number) => n / view.scale;

  // The gesture handlers are made once and read the view through a ref.
  // Rebuilding them when the view changes would replace the responder in
  // the middle of a drag.
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragFrom = useRef<MapView | null>(null);

  const zoom = (factor: number) =>
    setView((v) =>
      containView({
        ...v,
        scale: clamp(v.scale * factor, MIN_SCALE, MAX_SCALE),
      })
    );

  const pan = useMemo(
    () =>
      PanResponder.create({
        // False on start so a press still reaches the buttons above.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (event, gesture) =>
          viewRef.current.scale > MIN_SCALE
          && event.nativeEvent.touches.length >= PAN_FINGERS
          && (Math.abs(gesture.dx) > DRAG_SLOP
            || Math.abs(gesture.dy) > DRAG_SLOP),
        onPanResponderGrant: () => {
          dragFrom.current = viewRef.current;
        },
        onPanResponderMove: (event, gesture) => {
          const start = dragFrom.current;
          if (start === null) return;
          // A finger lifted mid-drag ends the pan rather than turning it into
          // a one-finger one. Otherwise letting go of one finger would carry
          // on moving the map, which is the behaviour this avoids.
          if (event.nativeEvent.touches.length < PAN_FINGERS) {
            dragFrom.current = null;
            return;
          }
          // The map follows the finger, so the window moves the other way.
          // Screen pixels become disc pixels by dividing by the scale.
          setView(
            containView({
              scale: start.scale,
              cxF: start.cxF - gesture.dx / (size * start.scale),
              cyF: start.cyF - gesture.dy / (size * start.scale),
            }),
          );
        },
        onPanResponderRelease: () => {
          dragFrom.current = null;
        },
        onPanResponderTerminate: () => {
          dragFrom.current = null;
        },
      }),
    [size],
  );

  const fitToReach = () => {
    const box = geometry.reachBox;
    if (box === null) return;
    const width = Math.max(1, box.maxX - box.minX);
    const height = Math.max(1, box.maxY - box.minY);
    // A tenth of margin, so the edge cells are inside the frame rather
    // than cut by it.
    const scale = clamp(
      (size / Math.max(width, height)) * 0.9,
      MIN_SCALE,
      MAX_SCALE,
    );
    setView(containView({
      scale,
      cxF: (box.minX + box.maxX) / 2 / size,
      cyF: (box.minY + box.maxY) / 2 / size,
    }));
  };

  const windowSize = size / view.scale;
  const viewBox = [
    view.cxF * size - windowSize / 2,
    view.cyF * size - windowSize / 2,
    windowSize,
    windowSize,
  ].map((n) => n.toFixed(2)).join(' ');

  const zoomedIn = view.scale > MIN_SCALE;

  return (
    <View
      style={[styles.wrap, {
        width: size,
        height: size,
        backgroundColor: ui.inset,
      }]}
    >
      {
        /* The drawing is one accessible element with one label. The
           controls are siblings rather than children, because a container
           marked `accessible` swallows the buttons inside it. */
      }
      <View
        {...pan.panHandlers}
        accessible
        accessibilityLabel={coverage
          ? t('a11y.coverage', {
            band: coverage.band,
            percent: Math.round(coverage.reach * 100),
          })
          : t('reach.mapLoading')}
      >
        <Svg width={size} height={size} viewBox={viewBox}>
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

          {
            /* The fine grid over the coarse one, on the same ramp, so a
               reader is not asked to learn a second scale for the same
               quantity. It is drawn second and simply covers the cells
               under it — where they disagree, the finer answer is the one
               computed at that place rather than an average over a
               thousand kilometres. */
          }
          <G>
            {geometry.patchCells.map((cell) => (
              <Path
                key={cell.key}
                d={cell.d}
                fill={ramp[cell.quality].fill}
                fillOpacity={ramp[cell.quality].opacity}
              />
            ))}
          </G>

          {
            /* Near-vertical incidence, as a stipple rather than a colour.
               Reliability already owns colour and night owns tint, so a
               third quantity carried by either would make the map
               contradict its own scale — the same fault the night wash
               had. A dot is a mark type nothing else on the map uses, it
               does not change the colour underneath it, and a field of
               them reads as one region without claiming an edge the
               engine never computed. */
          }
          <G>
            {geometry.nvisDots.map((dot) => (
              <Circle
                key={dot.key}
                cx={dot.at[0]}
                cy={dot.at[1]}
                r={px(1.2)}
                fill={ui.ink}
                fillOpacity={0.55}
              />
            ))}
          </G>

          {
            /* Night tints rather than recolours — see NIGHT_OPACITY.

               The fill and the edge are drawn separately because they are
               not the same shape. The edge is always the terminator; the
               fill is whichever side of it is dark, and when that is the
               outer side it takes the whole disc as a second subpath and
               lets the even-odd rule punch the lit region out of it. */
          }
          {geometry.terminator === undefined ? null : (
            <Path
              d={geometry.nightFill}
              fillRule="evenodd"
              fill={dark ? '#000000' : '#12151F'}
              fillOpacity={dark ? NIGHT_OPACITY.dark : NIGHT_OPACITY.light}
            />
          )}

          {geometry.nightRuns.map((run) => (
            <Path
              key={`n${run.length}-${run[0]?.[0]}`}
              d={pathOf(run, geometry.terminator !== undefined)}
              fill="none"
              stroke={ui.mapGuide}
              strokeWidth={px(0.9)}
              strokeDasharray={`${px(4)} ${px(4)}`}
              strokeOpacity={0.7}
            />
          ))}

          {geometry.coast.map((d) => (
            <Path
              key={`c${d}`}
              d={d}
              fill="none"
              stroke={ui.mapLine}
              strokeWidth={px(0.9)}
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
              stroke={ui.mapGuide}
              strokeWidth={px(0.8)}
              strokeDasharray={`${px(3)} ${px(5)}`}
              strokeOpacity={0.55}
            />
          ))}

          {geometry.path.map((d) => (
            <Path
              key={`p${d}`}
              d={d}
              fill="none"
              stroke={ui.amberNum}
              strokeWidth={px(1.6)}
            />
          ))}

          {geometry.target
            ? (
              <Circle
                cx={geometry.target[0]}
                cy={geometry.target[1]}
                r={px(4)}
                fill={ui.card}
                stroke={ui.amberNum}
                strokeWidth={px(2)}
              />
            )
            : null}

          {geometry.home
            ? (
              <Circle
                cx={geometry.home[0]}
                cy={geometry.home[1]}
                r={px(4.5)}
                fill={ui.amberNum}
                stroke={ui.card}
                strokeWidth={px(1.5)}
              />
            )
            : null}

          {/* Drawn last so the rim is a clean edge over everything. */}
          <Circle
            cx={p.cx}
            cy={p.cy}
            r={p.radius - px(0.5)}
            fill="none"
            stroke={ui.line}
            strokeWidth={px(1)}
          />
        </Svg>
      </View>

      {
        /* 44px targets, over the map rather than beside it: the card is
           already the tallest thing on the screen. */
      }
      <View style={styles.controls}>
        <IconButton
          icon="plus"
          size={20}
          mode="contained-tonal"
          disabled={view.scale >= MAX_SCALE}
          onPress={() => zoom(ZOOM_STEP)}
          accessibilityLabel={t('a11y.zoomIn')}
          style={styles.control}
        />
        <IconButton
          icon="minus"
          size={20}
          mode="contained-tonal"
          disabled={!zoomedIn}
          onPress={() => zoom(1 / ZOOM_STEP)}
          accessibilityLabel={t('a11y.zoomOut')}
          style={styles.control}
        />
        {
          /* Disabled when this band reaches nowhere, because then there is
             no reach to frame. */
        }
        <IconButton
          icon="crop-free"
          size={20}
          mode="contained-tonal"
          disabled={geometry.reachBox === null}
          onPress={fitToReach}
          accessibilityLabel={t('a11y.fitReach')}
          style={styles.control}
        />
        <IconButton
          icon="earth"
          size={20}
          mode="contained-tonal"
          disabled={!zoomedIn && view.cxF === 0.5 && view.cyF === 0.5}
          onPress={() => setView(WHOLE_GLOBE)}
          accessibilityLabel={t('a11y.wholeGlobe')}
          style={styles.control}
        />
      </View>

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

      {
        /* Only once there is somewhere to pan to. A gesture nobody can guess
           has to be said, and saying it before it works would be noise on
           every other screenful. */
      }
      {zoomedIn
        ? (
          <View
            pointerEvents="none"
            style={[styles.hint, { backgroundColor: ui.card }]}
          >
            <Text style={[typography.caption, { color: ui.text3 }]}>
              {t('reach.panHint')}
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
  controls: {
    position: 'absolute',
    top: spacing.xs,
    end: spacing.xs,
    gap: 2,
  },
  control: { margin: 0 },
  // Written out rather than spread from `StyleSheet`, which has called this
  // shape two different things and given them two different types: an object
  // in React Native 0.86, an opaque registered style in 0.73. Both builds have
  // to compile.
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  message: { textAlign: 'center' },
  hint: {
    position: 'absolute',
    bottom: spacing.xs,
    start: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    opacity: 0.92,
  },
});
