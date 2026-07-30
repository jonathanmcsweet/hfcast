import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toPlace } from '../src/data/geocode.ts';
import {
  fastCharDate,
  nearestStation,
  parseFastChar,
  STATIONS,
  usefulStation,
} from '../src/data/ionosonde.ts';

/**
 * The two services the device now asks for itself, having stopped going
 * through a server it cannot reach.
 *
 * Only the parts that do not need a network are here: choosing a station,
 * formatting the request, and reading the answers. What is upstream is
 * somebody else's, and a test that called it would fail on a train.
 */

describe('choosing an ionosonde', () => {
  it('picks the nearest of the confirmed stations', () => {
    // Berlin. Juliusruh is on the Baltic coast, about 250 km north.
    const near = nearestStation(52.52, 13.4);
    assert.equal(near.ursi, 'JR055');
    assert.ok(near.km < 300, `${near.km} km`);
  });

  it('quotes nobody when the nearest is too far to mean anything', () => {
    // Seattle's nearest confirmed station is Juliusruh at about 7,900 km.
    // A sounder that far away measures a different ionosphere at a different
    // local time, and showing it beside the forecast would imply otherwise.
    assert.equal(usefulStation(47.61, -122.33), null);
    assert.equal(usefulStation(-33.87, 151.21), null);
  });

  it('still finds one in the places it does cover', () => {
    const covered = [
      [38.01, 23.53],
      [41.9, 12.5],
      [-33.3, 26.5],
    ] as const;
    for (const [lat, lon] of covered) {
      assert.notEqual(usefulStation(lat, lon), null, `${lat},${lon}`);
    }
  });

  it('carries the same six stations the server has', () => {
    // The two lists have to agree, or the app and the web build quote
    // different sounders for the same location.
    assert.equal(STATIONS.length, 6);
    assert.deepEqual(
      STATIONS.map((s) => s.ursi).sort(),
      ['AT138', 'EB040', 'GR13L', 'JR055', 'RO041', 'SO148'],
    );
  });
});

describe('asking GIRO for a window', () => {
  it('writes the date in the format the API takes, in UTC', () => {
    assert.equal(
      fastCharDate(new Date('2026-07-30T17:05:00Z')),
      '2026.07.30T17:05',
    );
  });

  it('pads every field, since the API is positional', () => {
    assert.equal(
      fastCharDate(new Date('2026-01-02T03:04:00Z')),
      '2026.01.02T03:04',
    );
  });
});

describe('reading what GIRO sends back', () => {
  // The shape of a real response, taken from Juliusruh on 2026-07-30.
  const body = [
    '# GIRO FastChar',
    '# ursiCode=JR055 charName=foF2',
    '2026-07-30T16:53:16.000Z  80  6.300 //',
    '2026-07-30T17:13:16.000Z 100  6.350 //',
    '2026-07-30T17:28:16.000Z 100  6.500 //',
    '',
  ].join('\n');

  it('takes the most recent usable row, not the most confident', () => {
    // A slightly less certain reading from ten minutes ago describes the
    // ionosphere better than a confident one from an hour ago.
    const reading = parseFastChar(body);
    assert.equal(reading?.fof2, 6.5);
    assert.equal(reading?.confidence, 100);
    assert.equal(reading?.measuredAt, '2026-07-30T17:28:16.000Z');
  });

  it('drops rows the autoscaler had no confidence in', () => {
    // Zero-confidence values sit visibly wrong — 3.55 MHz between neighbours
    // of 7.4 and 6.2 in one sample — so they are not measurements.
    const withJunk = [
      '2026-07-30T17:00:00.000Z 100  6.300 //',
      '2026-07-30T17:30:00.000Z   0  3.550 //',
    ].join('\n');
    assert.equal(parseFastChar(withJunk)?.fof2, 6.3);
  });

  it('says nothing when the station had nothing in the window', () => {
    assert.equal(parseFastChar('# STATUS: ERROR\n'), null);
    assert.equal(parseFastChar(''), null);
  });

  it('ignores a row it cannot read rather than reporting NaN', () => {
    const malformed = '2026-07-30T17:00:00.000Z  --  ---- //\nnot a row\n';
    assert.equal(parseFastChar(malformed), null);
  });
});

describe('reading what the geocoder sends back', () => {
  it('gives every place a locator, which the geocoder does not', () => {
    // Everything else in the app carries one, and a place without one
    // cannot be used as an endpoint.
    const place = toPlace({
      name: 'Chattanooga',
      latitude: 35.04563,
      longitude: -85.30968,
      country: 'United States',
      admin1: 'Tennessee',
    });
    // Upper case throughout, including the subsquare, which convention
    // writes in lower case. That is how `latLonToGrid` has always written
    // one and how `isGrid` reads one, so it is not this module's to change.
    assert.equal(place.grid, 'EM75IB');
    assert.equal(place.name, 'Chattanooga');
    assert.equal(place.admin1, 'Tennessee');
  });

  it('reports a missing country as null rather than as empty text', () => {
    // The list joins the parts it has with a separator, so an empty string
    // would print a stray dot.
    const place = toPlace({ name: 'Somewhere', latitude: 0, longitude: 0 });
    assert.equal(place.country, null);
    assert.equal(place.admin1, null);
  });
});
