import { distanceKm } from '../../../shared/geo.ts';
import type { Sounding } from './types.ts';

/**
 * Measured foF2 from the nearest ionosonde, fetched by the device itself.
 *
 * This mirrors `server/src/ionosonde.ts`, which is where the reasoning about
 * the data lives. It exists separately because the server address stopped
 * being something a user can set, so an installed build had no server to ask
 * and the measurement was simply absent on every phone.
 *
 * GIRO answers with `Access-Control-Allow-Origin: https://giro.uml.edu`, so a
 * browser is blocked and a native app is not. That is why the web build still
 * goes through the server and this does not replace it.
 *
 * It is display only. Feeding measured maps into the model was tried and did
 * not pay — see the IRTAM study in the engine repository. What it is for is
 * honesty: the model assumed this, a sounder near your path measured that.
 */

const FASTCHAR = 'https://lgdc.uml.edu/fastchar/getbest';

const FETCH_TIMEOUT_MS = 8000;

/**
 * How far back to look. Long enough to survive a station skipping a slot,
 * short enough that the value still describes now.
 */
const WINDOW_MINUTES = 90;

/**
 * DIDBase autoscaling reports a confidence with each value. Zero means the
 * scaler had none, and those readings sit visibly wrong — 3.55 MHz between
 * neighbours of 7.4 and 6.2 in one sample. Below this a row is dropped rather
 * than shown as a measurement.
 */
const MIN_CONFIDENCE = 50;

/**
 * Beyond this the nearest station is not worth quoting. A sounder measures the
 * ionosphere above itself, and at several thousand kilometres that is a
 * different ionosphere at a different local time. Without the limit the search
 * always finds something: a request from Seattle matched Juliusruh at 7,914 km.
 */
const MAX_STATION_KM = 1500;

export interface Station {
  /** URSI code, the API's identifier. */
  readonly ursi: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

/**
 * Stations confirmed to be returning scored soundings on 2026-07-28.
 *
 * Deliberately only the confirmed ones. A list padded with stations that
 * answer nothing would make the nearest-station search pick a silent
 * neighbour over a live one further away, which is worse than admitting there
 * is no coverage. Coverage is essentially Europe plus one station in South
 * Africa; everywhere else this returns null and the card shows nothing.
 *
 * Kept identical to the server's list. A station going quiet turns this into a
 * wrong nearest match rather than a missing one, so it wants re-testing.
 */
export const STATIONS: readonly Station[] = [
  { ursi: 'AT138', name: 'Athens', lat: 38.01, lon: 23.53 },
  { ursi: 'EB040', name: 'Roquetes', lat: 40.8, lon: 0.5 },
  { ursi: 'JR055', name: 'Juliusruh', lat: 54.63, lon: 13.41 },
  { ursi: 'RO041', name: 'Rome', lat: 41.9, lon: 12.5 },
  { ursi: 'SO148', name: 'Sopron', lat: 47.63, lon: 16.72 },
  { ursi: 'GR13L', name: 'Grahamstown', lat: -33.3, lon: 26.5 },
];

/** Great-circle distance in km. */
/** The closest station, however far away it is. */
export function nearestStation(
  lat: number,
  lon: number,
): Station & { km: number; } {
  const nearest = STATIONS
    .map((station) => ({
      station,
      km: distanceKm(lat, lon, station.lat, station.lon),
    }))
    .reduce((best, next) => (next.km < best.km ? next : best));
  return { ...nearest.station, km: Math.round(nearest.km) };
}

/** The nearest station, or null when the closest is too far to mean anything. */
export function usefulStation(
  lat: number,
  lon: number,
): (Station & { km: number; }) | null {
  const near = nearestStation(lat, lon);
  return near.km <= MAX_STATION_KM ? near : null;
}

/** The API's date format: `YYYY.MM.DDTHH:MM`, always UTC. */
export function fastCharDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`
    + `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

interface Reading {
  fof2: number;
  measuredAt: string;
  confidence: number;
}

/** One data row, or null when it is not one this reader can use. */
function readRow(line: string): Reading | null {
  const parts = line.split(/\s+/);
  if (parts.length < 3) return null;
  const [stamp, score, value] = parts as [string, string, string];
  const confidence = Number(score);
  const fof2 = Number(value);
  if (!Number.isFinite(confidence) || !Number.isFinite(fof2)) return null;
  if (fof2 <= 0 || confidence < MIN_CONFIDENCE) return null;
  const measured = new Date(stamp);
  if (Number.isNaN(measured.getTime())) return null;
  return { fof2, measuredAt: measured.toISOString(), confidence };
}

/**
 * Reads the FastChar response.
 *
 * Plain text: comment lines start with `#`, then one row per sounding as
 * timestamp, confidence, value and qualifying letters.
 *
 * Returns the most recent row that clears `MIN_CONFIDENCE` — most recent
 * rather than highest scoring, because a slightly less certain reading from
 * ten minutes ago describes the ionosphere better than a confident one from
 * an hour ago.
 */
export function parseFastChar(body: string): Reading | null {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map(readRow)
    .filter((row): row is Reading => row !== null)
    .reduce<Reading | null>(
      (best, row) =>
        best === null || row.measuredAt > best.measuredAt ? row : best,
      null,
    );
}

/**
 * The nearest station's most recent usable sounding, or null.
 *
 * Null is an ordinary outcome rather than an error: most of the world has no
 * live station, and a service run by a research group is allowed to be down.
 * Nothing on the screen depends on this.
 */
export async function fetchSounding(
  lat: number,
  lon: number,
  now = new Date(),
): Promise<Sounding | null> {
  const station = usefulStation(lat, lon);
  if (station === null) return null;

  const from = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  const url = `${FASTCHAR}?ursiCode=${station.ursi}&charName=foF2`
    + `&fromDate=${fastCharDate(from)}&toDate=${fastCharDate(now)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'text/plain' },
    });
    if (!response.ok) return null;
    const reading = parseFastChar(await response.text());
    if (reading === null) return null;
    return {
      station: station.name,
      ursi: station.ursi,
      km: station.km,
      ...reading,
    };
  } catch {
    // Unreachable, slow or malformed. Going quiet is the right answer: this
    // is a comparison beside the forecast, not part of it.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
