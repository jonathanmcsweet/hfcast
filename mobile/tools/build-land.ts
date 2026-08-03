/**
 * Turns Natural Earth's TopoJSON land outline into a plain GeoJSON asset.
 *
 * Run once, by hand, when the source data changes:
 *
 *     node --experimental-strip-types tools/build-land.ts
 *
 * The conversion happens here rather than in the app so the app carries no
 * TopoJSON decoder and does no work at launch. What ships is an array of rings,
 * each an array of [lon, lat] pairs, which is the shape the map projects
 * directly.
 *
 * Coordinates are rounded to two decimals — about a kilometre, which is finer
 * than a 110m-scale outline is accurate and far finer than a globe a few hundred
 * pixels wide can draw. It roughly halves the file.
 *
 * Source: Natural Earth via world-atlas, public domain.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';

const SOURCE = 'node_modules/world-atlas/land-110m.json';
const OUT = 'src/assets/land.json';
const PLACES = 2;
/** Rings smaller than this are dropped: islands too small to draw. */
const MIN_POINTS = 6;

type Ring = readonly (readonly number[])[];

interface Geometry {
  readonly type: string;
  readonly coordinates: readonly unknown[];
}

const round = (value: number): number => Number(value.toFixed(PLACES));

/**
 * A Polygon holds one list of rings; a MultiPolygon holds several. Both are
 * flattened to the same thing, since the map draws each ring independently and
 * has no use for the grouping.
 */
const ringsOf = (geometry: Geometry): readonly Ring[] =>
  (geometry.type === 'Polygon'
    ? [geometry.coordinates as Ring[]]
    : (geometry.coordinates as Ring[][])).flat();

const topology = JSON.parse(readFileSync(SOURCE, 'utf8'));
const land = feature(topology, topology.objects.land) as unknown as {
  features: readonly { geometry: Geometry; }[];
};

const rings = land.features
  .flatMap((f) => ringsOf(f.geometry))
  .filter((ring) => ring.length >= MIN_POINTS)
  .map((ring) => ring.map(([lon = 0, lat = 0]) => [round(lon), round(lat)]));

writeFileSync(OUT, JSON.stringify(rings));

const points = rings.reduce((total, ring) => total + ring.length, 0);
console.log(`${OUT}: ${rings.length} rings, ${points} points`);
