/**
 * `topojson-client` ships no types, and only `build-land.ts` uses it.
 *
 * Declared here rather than adding `@types/topojson-client`: one function, used
 * once, in a script that runs by hand. The real shape is wider than this — the
 * package also exposes `mesh`, `merge` and the quantisation helpers — and this
 * names only what is called, so an unused part of the API cannot go stale.
 */
declare module 'topojson-client' {
  /** Turns a TopoJSON object into a GeoJSON FeatureCollection. */
  export function feature(topology: unknown, object: unknown): unknown;
}
