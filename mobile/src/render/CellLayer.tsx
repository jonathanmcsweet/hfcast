/**
 * The cell renderer, as the map asks for it.
 *
 * On Android this is the platform's own Canvas, through the local
 * `cell-canvas` module. Android has carried Skia in the operating system
 * since version 1.0, so the drawing is the same drawing; what it is not is
 * a second private copy of Skia inside the APK.
 *
 * Web gets Skia, because on web there is no operating-system canvas to
 * borrow and CanvasKit is a download rather than 13.9 MB of every install.
 * `CellLayer.web.tsx` loads it and is chosen by filename, which is the only
 * choice that works: a run-time platform test would already have pulled the
 * web loader into the Android bundle.
 */
export { default } from './CellNative.tsx';
