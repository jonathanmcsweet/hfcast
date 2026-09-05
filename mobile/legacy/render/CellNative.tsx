/**
 * `src/render/CellNative.tsx` as the legacy build sees it.
 *
 * Nothing renders this: `hasCanvas` is false in the legacy tree, so
 * `CoverageGlobe` draws the cell buckets as SVG paths and never reaches a
 * canvas. It exists because the file has to resolve and typecheck.
 *
 * The real one would work here. It uses nothing newer than Android 5.0 and
 * `legacy/modules/cell-canvas/` already carries its gradle file, so this is
 * waiting on the legacy build being tested on a device rather than on any
 * missing piece.
 */
import type { CellLayerProps } from '../data/cellField.ts';

export default function CellNative(_props: CellLayerProps) {
  return null;
}
