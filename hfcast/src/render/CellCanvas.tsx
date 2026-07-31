/**
 * The cell field, drawn on a canvas.
 *
 * This is the modern build's renderer for the four layers that carry the
 * forecast itself: the disc the world sits on, the coarse cells, the
 * fine patch with its backing, and the near-vertical stipple. Everything
 * else on the map — coast, rings, night, markers — stays in SVG above
 * it, because there are only about two hundred of those and they are
 * fiddly in ways SVG is good at.
 *
 * The split is by cost, not by kind. SVG gives every cell its own
 * element in the view tree, which is what puts a ceiling near a thousand
 * cells; a canvas draws a bucket of any size in one call. `cellField`
 * has already merged each quality into a single path, so this file draws
 * four paths whether the forecast has 192 cells or 34,560.
 *
 * The legacy build never loads this file. It has no Skia, and
 * `CoverageGlobe` draws the same buckets as SVG paths instead — from the
 * same strings, so the two renderers cannot disagree about geometry.
 */
import React, { useMemo } from 'react';

import { Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import type { CellBucket, CellLayerProps } from '../data/cellField.ts';

/**
 * Parse the bucket strings into Skia paths, once per data change.
 *
 * Path building is the whole cost of this renderer, so it must never
 * happen in a frame. Pan and zoom change only the group's matrix, which
 * leaves these untouched.
 *
 * `MakeFromSVGString` rather than a series of move/line calls: the
 * strings already exist — SVG needs them in exactly this form — and
 * parsing them in one native call crosses the JavaScript boundary once
 * instead of once per point.
 */
const useBucketPaths = (buckets: CellBucket[]) =>
  useMemo(
    () =>
      buckets.flatMap((bucket) => {
        const path = Skia.Path.MakeFromSVGString(bucket.d);
        return path === null ? [] : [{ quality: bucket.quality, path }];
      }),
    [buckets],
  );

export default function CellCanvas({
  p,
  transform,
  size,
  coarse,
  patch,
  patchBacking,
  nvis,
  ramp,
  card,
  ink,
}: CellLayerProps) {
  const coarsePaths = useBucketPaths(coarse);
  const patchPaths = useBucketPaths(patch);
  const backing = useMemo(
    () =>
      patchBacking === '' ? null : Skia.Path.MakeFromSVGString(patchBacking),
    [patchBacking],
  );

  // Translate then scale, so a point is scaled first and then moved —
  // the same order the SVG viewBox applies, which is what keeps the two
  // layers registered. `viewTransform` owns both forms; nothing here
  // recomputes either.
  const matrix = useMemo(
    () => [
      { translateX: transform.tx },
      { translateY: transform.ty },
      { scale: transform.scale },
    ],
    [transform.tx, transform.ty, transform.scale],
  );

  // Marks keep their size on screen, so anything measured in pixels is
  // divided by the scale before it enters the scaled group.
  const dotRadius = 1.2 / transform.scale;

  return (
    <Canvas style={canvasStyle(size)}>
      <Group transform={matrix}>
        {/* The disc is the whole earth. Nothing is drawn outside it. */}
        <Circle cx={p.cx} cy={p.cy} r={p.radius} color={card} />

        {coarsePaths.map((bucket) => (
          <Path
            key={bucket.quality}
            path={bucket.path}
            color={ramp[bucket.quality].fill}
            opacity={ramp[bucket.quality].opacity}
          />
        ))}

        {
          /* An opaque backing under the fine cells. Every cell is drawn
             with some transparency, so a fine cell laid straight over a
             coarse one shows the coarse colour through it and the coarse
             edges stay visible across the region — worst exactly where
             the two disagree, which is the reason the fine grid is run.
             Filling the rectangle with the disc's colour first puts the
             fine cells on the same background the coarse cells have. */
        }
        {backing === null
          ? null
          : <Path path={backing} color={card} />}

        {patchPaths.map((bucket) => (
          <Path
            key={bucket.quality}
            path={bucket.path}
            color={ramp[bucket.quality].fill}
            opacity={ramp[bucket.quality].opacity}
          />
        ))}

        {
          /* Near-vertical incidence, as a stipple rather than a colour.
             Reliability already owns colour and night owns tint, so a
             third quantity carried by either would make the map
             contradict its own scale. */
        }
        {nvis.map(([x, y]) => (
          <Circle
            key={`${x},${y}`}
            cx={x}
            cy={y}
            r={dotRadius}
            color={ink}
            opacity={0.55}
          />
        ))}
      </Group>
    </Canvas>
  );
}

/**
 * The canvas sits under the SVG, which carries the coast and the markers
 * and is transparent everywhere else.
 *
 * One flat object rather than a `StyleSheet.create` entry in an array.
 * On web this style reaches a real DOM element's `style`, and a React
 * Native style array arrives there as an array — which the browser tries
 * to assign by index and refuses: "Failed to set an indexed property [0]
 * on 'CSSStyleDeclaration'". Native accepts either form, so the flat one
 * is the one that works in both places.
 */
const canvasStyle = (size: number) => ({
  position: 'absolute' as const,
  top: 0,
  left: 0,
  width: size,
  height: size,
});
