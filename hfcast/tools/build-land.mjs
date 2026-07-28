/**
 * Turns Natural Earth's TopoJSON land outline into a plain GeoJSON asset.
 *
 * Run once, by hand, when the source data changes:
 *
 *     node tools/build-land.mjs
 *
 * The conversion happens here rather than in the app so the app carries no
 * TopoJSON decoder and does no work at launch. What ships is an array of
 * rings, each an array of [lon, lat] pairs, which is the shape the map
 * projects directly.
 *
 * Coordinates are rounded to two decimals — about a kilometre, which is
 * finer than a 110m-scale outline is accurate and far finer than a globe
 * a few hundred pixels wide can draw. It roughly halves the file.
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

const topology = JSON.parse(readFileSync(SOURCE, 'utf8'));
const land = feature(topology, topology.objects.land);

const rings = [];
for (const f of land.features) {
  const polygons = f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates]
    : f.geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (ring.length < MIN_POINTS) continue;
      rings.push(ring.map(([lon, lat]) => [
        Number(lon.toFixed(PLACES)),
        Number(lat.toFixed(PLACES)),
      ]));
    }
  }
}

writeFileSync(OUT, JSON.stringify(rings));
const points = rings.reduce((n, r) => n + r.length, 0);
console.log(`${OUT}: ${rings.length} rings, ${points} points`);
