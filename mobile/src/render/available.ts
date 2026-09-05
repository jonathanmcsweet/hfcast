/**
 * Whether this build can draw the cells on a canvas.
 *
 * A constant, and deliberately not a probe of any renderer.
 *
 * The first version of this asked the question by importing Skia and
 * testing what came back. That looked more honest and was worse, because
 * asking the question loaded the answer's dependencies: on web
 * `@shopify/react-native-skia` binds its API once, at module evaluation,
 * from `global.CanvasKit`, and CanvasKit is fetched later by the loader
 * in `CellLayer.web.tsx`. Importing the package early to see if it was
 * there bound the whole API to nothing, permanently, and the map failed
 * with `Cannot read properties of undefined (reading 'Path')`.
 *
 * So this file imports nothing, and the fact it states is a fact about
 * the build rather than about the runtime: the modern dependency set has
 * a canvas, the legacy one does not. `tools/build-android.sh` replaces
 * `src/render/` with `legacy/render/` for the legacy build, and the copy
 * of this file there says false. Nothing else in the app needs to know
 * which build it is.
 *
 * Which canvas is `CellLayer`'s business, not this file's: Android draws
 * on the platform's own, web on Skia through CanvasKit.
 */
export const hasCanvas = true;
