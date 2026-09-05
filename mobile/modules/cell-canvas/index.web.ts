/**
 * There is no web build of this module.
 *
 * The web bundle draws with CanvasKit, which is Skia compiled to WebAssembly
 * and fetched by `CellLayer.web.tsx`. That never enters an APK, so the reason
 * this module exists does not apply there.
 */
export const CellCanvasView = null;
export default CellCanvasView;
