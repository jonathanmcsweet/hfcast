/**
 * Coordinates somebody typed, in the two notations they are written in.
 *
 * Decimal — `39.74, -104.99` — is what a phone's own map app copies out, and
 * degrees-minutes-seconds — `39°44′N 104°59′W` — is what a paper map and most
 * repeater directories print. Both are arithmetic, so both work with no
 * network, which is the whole reason they belong beside the Maidenhead locator
 * rather than behind the geocoder.
 *
 * Nothing here guesses. A string that is not clearly one of the two forms
 * returns null and the search falls through to the place-name list, because a
 * misread coordinate would put the operator somewhere else entirely and look
 * exactly like a correct answer.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Latitude runs to the poles, longitude to the date line. */
const inRange = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon)
  && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/**
 * The characters a keyboard produces for the same three marks.
 *
 * A phone offers a typographic prime and a desktop offers a plain quote, and
 * both mean minutes. Normalising here rather than in the patterns keeps the
 * patterns readable.
 */
const normalise = (input: string): string =>
  input
    .replace(/[°º]/g, '°')
    .replace(/[′’']/g, "'")
    .replace(/[″”"]/g, '"')
    // A minus somebody pasted from a document, and the various spaces.
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * `39.74, -104.99` and the same without the comma.
 *
 * The separator has to be a comma or whitespace, and both numbers have to
 * carry a sign or a decimal point or be whole — what it must not match is a
 * locator or a place name with a number in it, which is why the whole string
 * is anchored.
 */
const DECIMAL_RE =
  /^([+-]?\d{1,3}(?:\.\d+)?)\s*[,;]?\s+?([+-]?\d{1,3}(?:\.\d+)?)$/;

const DECIMAL_COMMA_RE =
  /^([+-]?\d{1,3}(?:\.\d+)?)\s*,\s*([+-]?\d{1,3}(?:\.\d+)?)$/;

/**
 * One DMS component: degrees, optional minutes, optional seconds, and a
 * hemisphere letter on either side of the number.
 *
 * Seconds are optional because most people write degrees and minutes, and
 * minutes are optional because some write whole degrees with a hemisphere —
 * `39N 104W` is a coordinate, and it is not a decimal pair, since a bare
 * `39 104` could be anything.
 */
const DMS_PART =
  "([NSEW])?\\s*(\\d{1,3})(?:\\s*°)?(?:\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*')?"
  + '(?:\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*")?\\s*([NSEW])?';

const DMS_RE = new RegExp(`^${DMS_PART}[,;]?\\s+${DMS_PART}$`, 'i');

interface DmsPart {
  degrees: number;
  minutes: number;
  seconds: number;
  hemisphere: string | null;
}

/** Degrees, minutes and seconds are one number; the letter decides the sign. */
function dmsValue(part: DmsPart): number {
  const magnitude = part.degrees + part.minutes / 60 + part.seconds / 3600;
  const negative = part.hemisphere === 'S' || part.hemisphere === 'W';
  return negative ? -magnitude : magnitude;
}

const isLatitudeLetter = (letter: string | null): boolean =>
  letter === 'N' || letter === 'S';

const isLongitudeLetter = (letter: string | null): boolean =>
  letter === 'E' || letter === 'W';

function parseDms(text: string): LatLon | null {
  const match = DMS_RE.exec(text);
  if (!match) return null;

  const part = (offset: number): DmsPart | null => {
    const before = match[offset + 1] ?? '';
    const after = match[offset + 5] ?? '';
    // A letter on both sides is a contradiction, not a coordinate.
    if (before !== '' && after !== '') return null;
    const hemisphere = (before || after).toUpperCase();
    return {
      degrees: Number(match[offset + 2]),
      minutes: Number(match[offset + 3] ?? 0),
      seconds: Number(match[offset + 4] ?? 0),
      hemisphere: hemisphere === '' ? null : hemisphere,
    };
  };

  const first = part(0);
  const second = part(5);
  if (first === null || second === null) return null;

  // Both need a hemisphere. Without one there is nothing to say which number
  // is the latitude, and assuming an order is how a coordinate ends up
  // transposed into the middle of an ocean.
  if (first.hemisphere === null || second.hemisphere === null) return null;

  // Either order, because both are written: "39°44′N 104°59′W" and
  // "W104°59′ N39°44′" name the same place.
  const [latPart, lonPart] = isLatitudeLetter(first.hemisphere)
    ? [first, second]
    : [second, first];
  if (
    !isLatitudeLetter(latPart.hemisphere)
    || !isLongitudeLetter(lonPart.hemisphere)
  ) {
    return null;
  }

  const lat = dmsValue(latPart);
  const lon = dmsValue(lonPart);
  return inRange(lat, lon) ? { lat, lon } : null;
}

function parseDecimal(text: string): LatLon | null {
  // A comma separator is unambiguous. Without one both numbers must be
  // signed or decimal, so a bare "39 104" is not read as a coordinate.
  const match = DECIMAL_COMMA_RE.exec(text) ?? DECIMAL_RE.exec(text);
  if (!match) return null;
  if (!DECIMAL_COMMA_RE.test(text) && !/[.+-]/.test(text)) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return inRange(lat, lon) ? { lat, lon } : null;
}

/**
 * A typed coordinate, or null if the text is not one.
 *
 * Latitude first in the decimal form, which is the order every map application
 * copies and the order the examples in the field show.
 */
export function parseCoordinates(input: string): LatLon | null {
  const text = normalise(input);
  if (text === '') return null;
  return parseDms(text) ?? parseDecimal(text);
}

/** Four decimal places is about ten metres, and trailing zeros are noise. */
const place = (value: number): string => value.toFixed(4).replace(/\.?0+$/, '');

/**
 * A coordinate as a label, in the decimal form whatever was typed.
 *
 * One notation on screen rather than an echo of the input: the header shows
 * this where a place name would go, and a DMS string is long enough there to
 * push the controls off a narrow phone.
 */
export const formatLatLon = ({ lat, lon }: LatLon): string =>
  `${place(lat)}, ${place(lon)}`;
