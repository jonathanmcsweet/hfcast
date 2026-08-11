import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';
import Svg, { Circle, Path } from 'react-native-svg';

import { regionOf, viewTransform } from '../data/projection';
import type {
  Coverage,
  CoveragePatch,
  Endpoint,
  FineGlobe,
  MapRegion,
} from '../data/types';
import { hasSkia } from '../render/available';
import CellLayer from '../render/CellLayer';
import { radius as radii, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import GlobeCellsSvg from './globe/GlobeCellsSvg';
import { useGlobeGeometry } from './globe/useGlobeGeometry';
import { useGlobeView } from './globe/useGlobeView';

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
  patch?: CoveragePatch | null | undefined;
  /**
   * The whole-world fine grid, when this device runs one.
   *
   * It replaces the coarse cells rather than covering them: the two
   * answer the same question and the finer one is simply better, so
   * there is nothing to show through and no backing needed. Undefined
   * while it runs and null where it is not run at all, and both mean
   * the coarse cells stay.
   */
  fine?: FineGlobe | null | undefined;
  from: Endpoint;
  /** Drawn as a great circle from the centre. */
  to: Endpoint | null;
  /**
   * Whether the selected band is closed to `to` at this hour.
   *
   * The line to the destination is the one mark of it that survives
   * every zoom. Zoomed into the region the band does reach, a bright
   * line through a field of reachable cells reads as though the path
   * works, directly under a headline saying it does not. Muted, the
   * line carries the card's own answer onto the map. The colour is
   * supplementary — the answer is stated in text above the map — so
   * nothing rides on it alone.
   */
  toClosed?: boolean | undefined;
  /** UTC hour the terminator is drawn for. */
  hour: number;
  size: number;
  /**
   * Called with the part of the world the map is showing, so a caller
   * can run the fine grid there instead of around the station.
   *
   * Null at a whole-globe view: there is nothing to follow, and the
   * patch belongs at the station.
   */
  onRegion?: ((region: MapRegion | null) => void) | undefined;
  /**
   * Called with true while a two-finger pan owns the gesture, false when
   * it ends. The page's scroller listens: on Android it competes for the
   * same touches at the native layer, and it has to be told to stand
   * down or it takes the gesture back mid-pan.
   */
  onPanning?: ((active: boolean) => void) | undefined;
}

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
  fine,
  from,
  to,
  toClosed,
  hour,
  size,
  onRegion,
  onPanning,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const dark = theme.dark;
  const ui = theme.colors.ui;
  // The globe's own spacing of the quality ramp, wider than the grid's:
  // white coastlines over a partial fill compress perceived contrast, and
  // at the grid's spacing the middle two states stop reading as two.
  // From the theme, not from a boolean: there are three themes now and
  // only the theme knows which ramp it carries.
  const ramp = theme.colors.map;

  const geometry = useGlobeGeometry(
    from,
    to,
    size,
    hour,
    coverage,
    patch,
    fine,
  );
  const p = geometry.p;
  const globe = useGlobeView(size, onPanning);
  const { view } = globe;

  // A stroke is drawn after the viewBox scales everything, so a 1px line at
  // 4x would come out 4px thick. Every width, dash and marker radius is
  // divided by the scale to hold its size on screen.
  const px = (n: number) => n / view.scale;

  // Both layers place a point from this one value. If the canvas and the
  // SVG ever computed it separately the coastlines would slide off the
  // cells, which reads as the map being wrong about where land is rather
  // than as a rounding error.
  const transform = viewTransform(view, size);

  // Where the map is pointed, for whoever runs the fine grid. Reported
  // rather than computed there because only this component knows the
  // projection and the view, and the two together are what turn a
  // viewBox into degrees.
  useEffect(() => {
    if (onRegion === undefined) return;
    onRegion(regionOf(p, view, size));
  }, [onRegion, p, view, size]);

  return (
    <View
      style={[styles.wrap, {
        width: size,
        height: size,
        backgroundColor: ui.inset,
      }]}
    >
      {
        /* The cell field, on a canvas, under everything else.

           Only where a canvas exists. The legacy build has no Skia, so
           `hasSkia` is false there and the same buckets are drawn as SVG
           paths below — from the same strings, so the two renderers
           cannot disagree about geometry. Availability rather than a
           platform test, because that is the thing that actually
           differs. */
      }
      {hasSkia
        ? (
          <CellLayer
            p={p}
            transform={transform}
            size={size}
            coarse={geometry.coarse}
            patch={geometry.patchCells}
            patchBacking={geometry.patchBacking}
            nvis={geometry.nvisDots}
            ramp={ramp}
            card={ui.card}
            nvisDot={ui.nvisDot}
          />
        )
        : null}

      {
        /* The drawing is one accessible element with one label. The
           controls are siblings rather than children, because a container
           marked `accessible` swallows the buttons inside it. */
      }
      <View
        {...globe.pan.panHandlers}
        accessible
        accessibilityLabel={coverage
          ? t('a11y.coverage', {
            band: coverage.band,
            percent: Math.round(coverage.reach * 100),
          })
          : t('reach.mapLoading')}
      >
        <Svg width={size} height={size} viewBox={transform.viewBox}>
          {hasSkia ? null : (
            <GlobeCellsSvg
              cx={p.cx}
              cy={p.cy}
              radius={p.radius}
              coarse={geometry.coarse}
              patch={geometry.patchCells}
              patchBacking={geometry.patchBacking}
              nvis={geometry.nvisDots}
              ramp={ramp}
              card={ui.card}
              nvisDot={ui.nvisDot}
              px={px}
            />
          )}

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

          {geometry.nightPaths.map((d) => (
            <Path
              key={`n${d}`}
              d={d}
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
              stroke={toClosed ? ui.text3 : ui.amberNum}
              strokeOpacity={toClosed ? 0.6 : 1}
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
                stroke={toClosed ? ui.text3 : ui.amberNum}
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
          disabled={globe.atMaxScale}
          onPress={globe.zoomIn}
          accessibilityLabel={t('a11y.zoomIn')}
          style={styles.control}
        />
        <IconButton
          icon="minus"
          size={20}
          mode="contained-tonal"
          disabled={!globe.zoomedIn}
          onPress={globe.zoomOut}
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
          onPress={() => globe.fitTo(geometry.reachBox)}
          accessibilityLabel={t('a11y.fitReach')}
          style={styles.control}
        />
        <IconButton
          icon="earth"
          size={20}
          mode="contained-tonal"
          disabled={globe.atWholeGlobe}
          onPress={globe.showWholeGlobe}
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
      {globe.zoomedIn
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
