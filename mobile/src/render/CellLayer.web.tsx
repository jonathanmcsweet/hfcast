/**
 * The cell renderer on web, which has to fetch its runtime first.
 *
 * Skia on web is CanvasKit: a WASM blob of about 7.7 MB (3.1 MB
 * gzipped) that must be loaded before any Skia call — including the path
 * building `CellCanvas` does while it renders. So the canvas cannot be
 * imported directly here. `WithSkiaWeb` loads the runtime and only then
 * pulls the component in.
 *
 * The fallback is null rather than a spinner: the SVG layer above draws
 * the coast, the rings and the markers straight away, and the card
 * already carries the forecast in words above the map. A second loading
 * mark over a map that is visibly loading adds nothing.
 *
 * Two details this file exists to get right, both learned by getting
 * them wrong:
 *
 * - The blob ships in `public/`, which Expo copies to the root of
 *   `dist/`. `tools/copy-canvaskit.sh` puts it there. Without it the
 *   bundle asks for `canvaskit.wasm` and gets a 404 — and nothing in the
 *   build says so, because the file is fetched at run time.
 * - `locateFile` says where to ask for it. The default resolves relative
 *   to the JavaScript, which is not where the file is.
 *
 * Web is a development surface for this project rather than a shipping
 * one, so the download is a cost paid to test what Android runs. That is
 * the whole reason it is the same renderer rather than a cheaper one.
 */
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

import type { CellLayerProps } from '../data/cellField.ts';

export default function CellLayer(props: CellLayerProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./CellCanvas')}
      opts={{ locateFile: (file: string) => `/${file}` }}
      componentProps={props}
      fallback={null}
    />
  );
}
