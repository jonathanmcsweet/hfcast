/**
 * Measured foF2 from the nearest ionosonde, as a reality check beside the
 * forecast.
 *
 * This is display only. Feeding measured maps into the model was tried and
 * measured — see the IRTAM study in the engine repository — and did not
 * pay. What it is for is honesty: "the model assumed this, a sounder near
 * your path measured that, twenty minutes ago".
 *
 * ## Why the server fetches it rather than the app
 *
 * GIRO's FastChar API answers with
 * `Access-Control-Allow-Origin: https://giro.uml.edu`, so a browser
 * blocks it for any other origin and the web build cannot call it
 * directly. Native builds could, but then the same feature would need two
 * implementations. Fetching here also means one cache in front of a
 * service run by a research group rather than one request per client.
 *
 * ## What the data is actually like
 *
 * Measured on 2026-07-28 against all 31 stations in a published list: 9
 * were returning soundings and only 6 of those carried a usable
 * confidence score. Coverage is essentially Europe, plus one station in
 * South Africa. Everywhere else this returns null, and the UI has to be
 * comfortable showing nothing.
 */

const FASTCHAR = 'https://lgdc.uml.edu/fastchar/getbest';

const FETCH_TIMEOUT_MS = 8_000;

/**
 * How far back to look for a sounding. Long enough to survive a station
 * skipping a slot, short enough that the value still describes now.
 */
const WINDOW_MINUTES = 90;

/**
 * DIDBase autoscaling reports a confidence score with each value. Zero
 * means the scaler had no confidence, and those values sit visibly wrong
 * — 3.55 MHz between neighbours of 7.4 and 6.2 in one sample. Below this
 * the reading is dropped rather than shown as a measurement.
 */
const MIN_CONFIDENCE = 50;

/** How long a reading is reused. Stations sound every 5 to 15 minutes. */
export const IONOSONDE_TTL_MS = 5 * 60 * 1000;

/**
 * Beyond this the nearest station is not worth quoting. A sounder measures
 * the ionosphere above itself, and that stops resembling the ionosphere
 * above somebody else's path within a few hundred kilometres; at several
 * thousand it is a different ionosphere at a different local time.
 *
 * Without the limit the search always finds something: a request from
 * Seattle matched Juliusruh at 7,914 km, which would have been displayed
 * as if it meant something.
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
 * neighbour over a live one further away, which is worse than admitting
 * there is no coverage. URSI codes and coordinates are public GIRO
 * facts.
 *
 * Worth re-testing periodically: a station going quiet turns this into a
 * wrong nearest match rather than a missing one.
 */
export const STATIONS: readonly Station[] = [
  { ursi: 'AT138', name: 'Athens', lat: 38.01, lon: 23.53 },
  { ursi: 'EB040', name: 'Roquetes', lat: 40.8, lon: 0.5 },
  { ursi: 'JR055', name: 'Juliusruh', lat: 54.63, lon: 13.41 },
  { ursi: 'RO041', name: 'Rome', lat: 41.9, lon: 12.5 },
  { ursi: 'SO148', name: 'Sopron', lat: 47.63, lon: 16.72 },
  { ursi: 'GR13L', name: 'Grahamstown', lat: -33.3, lon: 26.5 },
];

export interface Sounding {
  readonly station: string;
  readonly ursi: string;
  /** Great-circle distance from the point asked about, km. */
  readonly km: number;
  /** Critical frequency of the F2 layer, MHz. */
  readonly fof2: number;
  /** When the sounding was taken, ISO 8601. */
  readonly measuredAt: string;
  /** DIDBase autoscaling confidence, 0-100. */
  readonly confidence: number;
}

/** Great-circle distance in km. Duplicated from geo.ts to keep this module standalone. */
function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The closest station, however far away. Callers wanting a station worth
 * quoting use `usefulStation`, which applies `MAX_STATION_KM`.
 */
export function nearestStation(
  lat: number,
  lon: number,
): Station & { km: number; } {
  let best = STATIONS[0] as Station;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const s of STATIONS) {
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return { ...best, km: Math.round(bestKm) };
}

/** The nearest station, or null when the closest one is too far to mean anything. */
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

/**
 * Reads the FastChar response.
 *
 * The body is plain text: comment lines start with `#`, then one row per
 * sounding as timestamp, confidence, value and qualifying letters. A
 * `STATUS: ERROR` comment means the station had nothing in the window.
 *
 * Returns the most recent row that clears `MIN_CONFIDENCE`. Most recent
 * rather than highest scoring: a slightly less certain reading from ten
 * minutes ago describes the ionosphere better than a confident one from
 * an hour ago.
 */
export function parseFastChar(
  body: string,
): { fof2: number; measuredAt: string; confidence: number; } | null {
  let best: { fof2: number; measuredAt: string; confidence: number; } | null =
    null;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    const [stamp, score, value] = parts as [string, string, string];
    const confidence = Number(score);
    const fof2 = Number(value);
    if (!Number.isFinite(confidence) || !Number.isFinite(fof2)) continue;
    if (fof2 <= 0 || confidence < MIN_CONFIDENCE) continue;
    const measuredAt = new Date(stamp).toISOString();
    if (best === null || measuredAt > best.measuredAt) {
      best = { fof2, measuredAt, confidence };
    }
  }
  return best;
}

/**
 * The nearest station's most recent usable sounding, or null.
 *
 * Null is an ordinary outcome, not an error: most of the world has no
 * live station, and a research service is allowed to be down.
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

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
    // Unreachable, slow or malformed. The forecast does not depend on
    // this, so it goes quiet rather than failing a request.
    return null;
  }
}
