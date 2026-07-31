/**
 * The cell renderer, as the map asks for it.
 *
 * On native the Skia runtime is inside the binary, so this is the canvas
 * itself with nothing in the way. Web needs a loader first and gets it
 * from `CellLayer.web.tsx`; Metro chooses between the two by filename,
 * which is the only choice that works — a run-time platform test would
 * already have pulled the web loader into the native bundle.
 */
export { default } from './CellCanvas.tsx';
