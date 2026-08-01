/**
 * `src/render/CellLayer.tsx` as the legacy build sees it.
 *
 * Nothing renders this: `hasSkia` is false in the legacy tree, so
 * `CoverageGlobe` draws the cell buckets as SVG paths instead. It exists
 * because the file has to resolve and typecheck, and the real one
 * reaches Skia through the canvas.
 */
import type { CellLayerProps } from '../data/cellField.ts';

export default function CellLayer(_props: CellLayerProps) {
  return null;
}
