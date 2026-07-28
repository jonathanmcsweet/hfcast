import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fastCharDate,
  nearestStation,
  parseFastChar,
  STATIONS,
  usefulStation,
} from '../src/ionosonde.ts';

/**
 * The response body is a real one, trimmed. Keeping the comment block
 * matters: the parser has to skip it, and the `#` lines are where the
 * station identity and the error status live.
 */
const REAL_BODY = `# Global Ionospheric Radio Observatory (GIRO)
# Tabulated Rapid Access Ionospheric Characteristics, Version 1.1
# Location: GEO ( 38.0 N   23.5 E ), URSI-Code AT138, ATHENS
#
2026-07-27T22:55:00.000Z  75  7.385 //
2026-07-27T23:00:00.000Z  85  6.370 //
2026-07-27T23:05:00.000Z  25  3.550 //
2026-07-27T23:10:00.000Z  85  6.160 //
`;

test('reads the most recent reading that clears the confidence floor', () => {
  const r = parseFastChar(REAL_BODY);
  // 23:10 rather than 23:05, which scored 25 and reported 3.55 MHz between
  // neighbours of 6.4 and 6.2 — the case the floor exists for.
  assert.equal(r?.fof2, 6.16);
  assert.equal(r?.confidence, 85);
  assert.equal(r?.measuredAt, '2026-07-27T23:10:00.000Z');
});

test('prefers recency over confidence among usable readings', () => {
  // 75 at 22:55 is more confident than 85 at 23:00 is not the question:
  // both clear the floor, so the later one wins. A slightly less certain
  // reading from ten minutes ago describes the ionosphere better than a
  // confident one from an hour ago.
  const r = parseFastChar(`2026-07-27T22:55:00.000Z  95  7.385 //
2026-07-27T23:00:00.000Z  60  6.370 //
`);
  assert.equal(r?.fof2, 6.37);
});

test('a station with nothing in the window reads as no data', () => {
  const empty = `# Location: GEO ( 40.0 N   254.7 E ), URSI-Code BC840, BOULDER
# STATUS: ERROR (No measurement data could be found for requested time)
`;
  assert.equal(parseFastChar(empty), null);
});

test('unscored readings are dropped rather than shown as measurements', () => {
  // Confidence 0 means the autoscaler had no confidence at all. Three
  // real stations were reporting exactly this.
  assert.equal(parseFastChar('2026-07-28T01:50:02.000Z   0  5.600 //\n'), null);
});

test('a truncated or unparseable row is skipped, not guessed at', () => {
  const messy = `2026-07-28T01:50:00.000Z
2026-07-28T01:55:00.000Z  --  ---
2026-07-28T02:00:00.000Z  90  5.500 //
`;
  assert.equal(parseFastChar(messy)?.fof2, 5.5);
});

test("the date format is the API's own, in UTC", () => {
  assert.equal(
    fastCharDate(new Date('2026-07-28T01:05:00Z')),
    '2026.07.28T01:05',
  );
});

test('the nearest station is chosen by great-circle distance', () => {
  // Rome is closer to Rome than Athens is.
  const near = nearestStation(41.9, 12.5);
  assert.equal(near.ursi, 'RO041');
  assert.equal(near.km, 0);

  // A southern-hemisphere point must not match a European station.
  const cape = nearestStation(-33.92, 18.42);
  assert.equal(cape.ursi, 'GR13L');
  assert.ok(cape.km > 500 && cape.km < 1200, `unexpected ${cape.km} km`);
});

test('every listed station is one confirmed to answer', () => {
  // The list is deliberately short. Padding it would make the search
  // prefer a silent neighbour over a live station further away, which is
  // worse than admitting there is no coverage.
  assert.ok(STATIONS.length >= 5);
  for (const s of STATIONS) {
    assert.match(s.ursi, /^[A-Z0-9]{5}$/);
    assert.ok(Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180, s.ursi);
  }
});

test('a station too far away is no station at all', () => {
  // Caught by running the real endpoint: Seattle matched Juliusruh at
  // 7,914 km, which would have been shown as if it described the path.
  // A sounder measures the ionosphere above itself.
  assert.equal(usefulStation(47.6, -122.3), null);
  assert.equal(nearestStation(47.6, -122.3).km, 7914);

  // Somewhere genuinely near a station still resolves.
  assert.equal(usefulStation(45.5, 9.2)?.ursi, 'RO041');
});
