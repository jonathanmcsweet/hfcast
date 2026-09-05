/**
 * The cell field, drawn by Android's own Canvas.
 *
 * Android's 2D drawing has been Skia since version 1.0, so this is the same
 * engine `@shopify/react-native-skia` bundles a second private copy of. That
 * copy was 13.9 MB of the APK and 214 MB of prebuilt libraries F-Droid will
 * not accept, and none of it was buying anything the operating system does
 * not already have.
 *
 * The geometry is the strings `cellField` already writes, which is what let
 * the two be compared: a difference in what you see is a difference in the
 * renderer, not in the shapes it was given. Measured at 30 to 43 ms to build
 * the paths and 3 to 4 ms to record a frame, against a Skia build that was
 * visibly less smooth (user, 2026-08-21). That was a current flagship phone
 * and this app is for old cheap ones, so those are the best case and a
 * weaker device will take longer at both.
 */
import { useMemo } from 'react';
import { View } from 'react-native';

import CellCanvasView from '../../modules/cell-canvas';
import type { CellBucket, CellLayerProps } from '../data/cellField.ts';
import { NVIS_DOT_OPACITY } from '../theme.ts';
import type { QualityKey } from '../theme.ts';

type Ramp = Record<QualityKey, { fill: string; opacity: number; }>;

/** The colour lookup happens here, so the Kotlin never hears of a quality. */
const layersOf = (buckets: CellBucket[], ramp: Ramp) =>
  buckets.map((bucket) => ({
    d: bucket.d,
    color: ramp[bucket.quality].fill,
    opacity: ramp[bucket.quality].opacity,
  }));

export default function CellNative({
  p,
  transform,
  size,
  coarse,
  patch,
  patchBacking,
  nvis,
  ramp,
  card,
  nvisDot,
}: CellLayerProps) {
  // Coarse cells, the opaque backing, then the fine patch. One array in draw
  // order, because the order is the only thing the renderer needs to know.
  const layers = useMemo(
    () => [
      ...layersOf(coarse, ramp),
      ...(patchBacking === ''
        ? []
        : [{ d: patchBacking, color: card, opacity: 1 }]),
      ...layersOf(patch, ramp),
    ],
    [coarse, patch, patchBacking, ramp, card],
  );

  // Flat x, y, x, y. A list of pairs would cross the bridge as one object
  // per dot, and there are as many dots as there are near-vertical cells.
  const dots = useMemo(() => nvis.flat(), [nvis]);

  const disc = useMemo(
    () => ({ cx: p.cx, cy: p.cy, radius: p.radius, color: card }),
    [p.cx, p.cy, p.radius, card],
  );

  // Marks keep their size on screen, so a pixel measurement is divided by
  // the scale before it enters the scaled canvas.
  const dot = useMemo(
    () => ({
      radius: 1.2 / transform.scale,
      color: nvisDot,
      opacity: NVIS_DOT_OPACITY,
    }),
    [transform.scale, nvisDot],
  );

  const xform = useMemo(
    () => ({ tx: transform.tx, ty: transform.ty, scale: transform.scale }),
    [transform.tx, transform.ty, transform.scale],
  );

  // Null where the module has no build, which is web. Nothing renders this
  // there — `CellLayer.web.tsx` is a different file — so this is a type
  // obligation rather than a case that happens.
  if (CellCanvasView === null) return <View />;

  return (
    <CellCanvasView
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
      }}
      layers={layers}
      dots={dots}
      disc={disc}
      dot={dot}
      transform={xform}
    />
  );
}
