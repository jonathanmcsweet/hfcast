import { Circle, G, Path } from 'react-native-svg';

import type { CellBucket } from '../../data/cellField';
import type { QualityKey } from '../../theme';

/**
 * The cell field, for a build with no canvas.
 *
 * `CellLayer` draws all of this when Skia is present, from the same bucket
 * strings — including the disc, which has to be under the cells and would
 * otherwise cover the canvas. So the whole group is one or the other,
 * never both, which is why it is a component rather than a branch inside
 * the drawing.
 *
 * The fine grid goes over the coarse one on the same ramp, so a reader is
 * not asked to learn a second scale for the same quantity. Where they
 * disagree the finer answer wins, which is what the backing underneath is
 * for: it clears the coarse cells out of the region rather than letting
 * them show through cells that are all partly transparent.
 *
 * The stipple marks near-vertical incidence. Reliability already owns
 * colour and night owns tint, so a third quantity carried by either would
 * make the map contradict its own scale.
 */

interface Props {
  cx: number;
  cy: number;
  radius: number;
  coarse: readonly CellBucket[];
  patch: readonly CellBucket[];
  patchBacking: string;
  nvis: readonly [number, number][];
  ramp: Readonly<Record<QualityKey, { fill: string; opacity: number; }>>;
  card: string;
  ink: string;
  /** One screen pixel at the current scale. See `CoverageGlobe`. */
  px: (n: number) => number;
}

export default function GlobeCellsSvg({
  cx,
  cy,
  radius,
  coarse,
  patch,
  patchBacking,
  nvis,
  ramp,
  card,
  ink,
  px,
}: Props) {
  return (
    <G>
      {/* The disc is the whole earth. Nothing is drawn outside it. */}
      <Circle cx={cx} cy={cy} r={radius} fill={card} />

      {coarse.map((bucket) => (
        <Path
          key={bucket.quality}
          d={bucket.d}
          fill={ramp[bucket.quality].fill}
          fillOpacity={ramp[bucket.quality].opacity}
        />
      ))}

      {patchBacking === '' ? null : <Path d={patchBacking} fill={card} />}

      {patch.map((bucket) => (
        <Path
          key={`p${bucket.quality}`}
          d={bucket.d}
          fill={ramp[bucket.quality].fill}
          fillOpacity={ramp[bucket.quality].opacity}
        />
      ))}

      {nvis.map(([x, y]) => (
        <Circle
          key={`n${x},${y}`}
          cx={x}
          cy={y}
          r={px(1.2)}
          fill={ink}
          fillOpacity={0.55}
        />
      ))}
    </G>
  );
}
