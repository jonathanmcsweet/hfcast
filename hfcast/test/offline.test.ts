import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { antennaFileName, antennaOnDisk } from '../src/data/antennaFile.ts';
import { CITY_COUNT, searchCities } from '../src/data/cities.ts';
import {
  LAT_STEP,
  LON_STEP,
  REACHABLE,
  reachOf,
} from '../src/data/coverageGrid.ts';
import { gridToLatLon, isGrid, latLonToGrid } from '../src/data/grid.ts';
import {
  SSN_TABLE_DATE,
  SSN_TABLE_RANGE,
  ssnForMonth,
} from '../src/data/ssn.ts';
import type { CoveragePoint } from '../src/data/types.ts';
import type { Antenna } from '../src/store/useStationStore.ts';

/**
 * The two things a forecast needs that the server used to supply: a sunspot
 * number, and an antenna the engine can read.
 *
 * Neither is a refinement. VOACAP takes the smoothed SSN as an input, so
 * without one there is no prediction at all; and the engine names an antenna by
 * filename, so a name that does not fit the card's 21 columns fails the run.
 */

const antenna = (over: Partial<Antenna> = {}): Antenna => ({
  type: 'dipole',
  heightM: 10,
  gainDbd: 6,
  beamDeg: 90,
  ...over,
});

describe('the sunspot number without a network', () => {
  it('gives an observed figure for a month that has one', () => {
    const early = ssnForMonth(2024, 1);
    assert.equal(early.basis, 'climatology');
    assert.equal(early.extrapolated, false);
    assert.ok(early.ssn > 0, `${early.ssn}`);
  });

  it('gives a prediction for a month not yet smoothed', () => {
    // NOAA cannot compute a twelve-month smoothed value for a recent month,
    // so those come from its forecast instead.
    const soon = ssnForMonth(2027, 6);
    assert.equal(soon.basis, 'forecast');
    assert.equal(soon.extrapolated, false);
  });

  it('covers every month in between, with no gaps', () => {
    // A gap would be a month of the year in which the app could not predict
    // at all, which is not a failure a smoke test would find.
    const [firstYear] = SSN_TABLE_RANGE.first.split('-').map(Number);
    const [lastYear] = SSN_TABLE_RANGE.last.split('-').map(Number);
    const months = Array.from(
      { length: (lastYear - firstYear + 1) * 12 },
      (_, i) => [firstYear + Math.floor(i / 12), (i % 12) + 1] as const,
    );
    const gaps = months.filter(([y, m]) => ssnForMonth(y, m).extrapolated);
    assert.deepEqual(gaps, []);
  });

  it('says so rather than pretending, outside the table', () => {
    // A solar minimum figure applied to a year nobody predicted is a guess,
    // and the difference between a stale forecast and a wrong one is whether
    // it admits which it is.
    const far = ssnForMonth(2099, 1);
    assert.equal(far.extrapolated, true);
    const long_ago = ssnForMonth(1990, 1);
    assert.equal(long_ago.extrapolated, true);
  });

  it('records when the figures were taken', () => {
    assert.match(SSN_TABLE_DATE, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the antenna file the engine reads', () => {
  it('fits the card, which holds 21 columns', () => {
    // The engine refuses a longer path rather than truncating it, so this is
    // the difference between an antenna and a failed run.
    const names = (['dipole', 'vertical', 'invertedL', 'yagi'] as const).map(
      (type) => antennaFileName(antenna({ type, heightM: 100, gainDbd: 20 })),
    );
    assert.deepEqual(
      names.map((name) => name.length <= 21),
      names.map(() => true),
      `${names}`,
    );
  });

  it('names one file per distinct antenna', () => {
    // Two stations with the same antenna should share a file; changing the
    // height must not keep reading the old one.
    assert.equal(
      antennaFileName(antenna({ heightM: 10 })),
      antennaFileName(antenna({ heightM: 10.4 })),
    );
    assert.notEqual(
      antennaFileName(antenna({ heightM: 10 })),
      antennaFileName(antenna({ heightM: 20 })),
    );
    assert.notEqual(
      antennaFileName(antenna({ type: 'yagi', gainDbd: 6 })),
      antennaFileName(antenna({ type: 'yagi', gainDbd: 12 })),
    );
  });

  it('writes no file for an unspecified antenna', () => {
    // The isotrope is what the engine defaults to when no antenna is named,
    // so writing one would describe an assumption as a measurement.
    assert.equal(antennaOnDisk(antenna({ type: 'isotropic' })), null);
  });

  it('puts the file where the engine will look for it', () => {
    // The engine joins `antennas/` in front of the name on the card, so the
    // two have to agree about the prefix.
    const disk = antennaOnDisk(antenna());
    assert.ok(disk);
    assert.equal(disk.path, `antennas/${disk.file}`);
  });

  it('writes the parameters the reference reads by position', () => {
    // Read carefully rather than copied between families: for the monopole
    // parameter 6 is its height, where the dipole has length then height.
    const dipole = antennaOnDisk(antenna({ type: 'dipole', heightM: 12 }));
    const vertical = antennaOnDisk(antenna({ type: 'vertical', heightM: 12 }));
    assert.ok(dipole && vertical);
    assert.match(dipole.text, /\[ 7\] Antenna Height:/);
    assert.match(vertical.text, /\[ 6\] Antenna Height:/);
    // The count on the second line is where the reader stops.
    const lines = dipole.text.split('\n');
    assert.equal(Number(lines[1]?.trim().split(/\s+/)[0]), 8);
  });
});

describe('the coverage grid the map is drawn on', () => {
  const at = (lat: number, reliability: number): CoveragePoint => ({
    lat,
    lon: 0,
    reliability,
  });

  it('tiles the sphere with no gap and no overlap', () => {
    // The map draws a cell around each point, so a step that does not divide
    // the sphere evenly would leave a seam or a double-covered row.
    assert.equal(180 % LAT_STEP, 0);
    assert.equal((360 / LON_STEP) % 1, 0);
    assert.equal((180 / LAT_STEP) * (360 / LON_STEP), 192);
  });

  it('counts a polar row for less than an equatorial one', () => {
    // Equal-angle cells are not equal areas. Without the weighting a band
    // reaching only the poles would score the same as one reaching only the
    // equator, and every band would look worse than it is.
    const polar = reachOf([at(82.5, 1), at(0, 0)]);
    const equatorial = reachOf([at(82.5, 0), at(0, 1)]);
    assert.ok(polar < equatorial, `${polar} !< ${equatorial}`);
    assert.ok(polar > 0);
  });

  it('reads the threshold as reachable, not just above it', () => {
    // The boundary belongs to the reachable side, matching `patchy` in the
    // quality bands: a cell exactly at the threshold is drawn as reached, so
    // the number and the picture have to agree about it.
    assert.equal(reachOf([at(0, REACHABLE)]), 1);
    assert.equal(reachOf([at(0, REACHABLE - 0.001)]), 0);
  });

  it('reports nothing rather than dividing by zero', () => {
    // An empty grid is a failed run, and 0 is the honest summary of it.
    assert.equal(reachOf([]), 0);
  });
});

describe('choosing a place without a network', () => {
  it('holds a worldwide list, not a handful', () => {
    // A list this size is the difference between a feature and a token: if it
    // covered only the Americas the search would fail silently for most of
    // the world, which reads as a broken app rather than a missing city.
    assert.ok(CITY_COUNT > 3000, `${CITY_COUNT}`);
  });

  it('finds cities on every continent', () => {
    const first = (query: string) => searchCities(query)[0];
    for (
      const name of [
        'Seattle',
        'Tokyo',
        'Nairobi',
        'Reykjavik',
        'Wellington',
        'Montevideo',
        'Mumbai',
      ]
    ) {
      const found = first(name);
      assert.ok(found, `no match for ${name}`);
      assert.equal(found.name, name);
    }
  });

  it('puts a name that starts with the query before one that contains it', () => {
    // Typing "york" means York more often than New York, and both should be
    // offered rather than the alphabet deciding.
    const names = searchCities('york').map((place) => place.name);
    const york = names.indexOf('York');
    const newYork = names.findIndex((name) => name.includes(' York'));
    assert.ok(york >= 0, names.join(', '));
    if (newYork >= 0) assert.ok(york < newYork, names.join(', '));
  });

  it('ignores case and accents', () => {
    // The list is plain ASCII, but a reader with a Spanish keyboard types the
    // accent, and refusing them would be worse than not folding at all.
    assert.equal(
      searchCities('zurich')[0]?.name,
      searchCities('ZÜRICH')[0]?.name,
    );
    assert.ok(searchCities('bogotá').length > 0);
  });

  it('gives every place a locator and a plausible position', () => {
    // A place with no grid would break the query key, and one at 0,0 would
    // silently forecast a path to the Atlantic.
    const sample = searchCities('a');
    assert.ok(sample.length > 0);
    for (const place of sample) {
      assert.match(place.grid, /^[A-R]{2}[0-9]{2}[A-X]{2}$/);
      assert.ok(Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180);
      assert.ok(place.lat !== 0 || place.lon !== 0);
    }
  });

  it('finds nothing for nothing, rather than everything', () => {
    assert.deepEqual(searchCities(''), []);
    assert.deepEqual(searchCities('   '), []);
  });

  it('narrows a repeated name by the region after the comma', () => {
    // The case this was written for. There are five Springfields in the
    // United States and the list gave all of them whatever else was typed.
    const all = searchCities('Springfield');
    const illinois = searchCities('Springfield, IL');
    assert.ok(
      all.length > illinois.length,
      `${all.length} vs ${illinois.length}`,
    );
    assert.ok(illinois.length > 0);
    for (const place of illinois) {
      assert.match(place.name, /^Springfield/);
      assert.match(place.admin1 ?? '', /\bIL\b/);
    }
  });

  it('matches the country after the comma as well as the state', () => {
    const usa = searchCities('Springfield, United');
    assert.ok(usa.length > 0);
    for (const place of usa) assert.match(place.country ?? '', /United/);
  });

  it('matches a region word rather than any substring of one', () => {
    // "il" is inside Brazil and Chile. Matching it there would make the
    // comma widen the search instead of narrowing it.
    for (const place of searchCities('a, il')) {
      assert.ok(
        !/Brazil|Chile/.test(place.country ?? ''),
        `${place.name}, ${place.country}`,
      );
    }
  });

  it('finds nothing where the region excludes everything', () => {
    assert.deepEqual(searchCities('Springfield, ZZ'), []);
  });

  it('is unchanged by a comma with nothing after it', () => {
    assert.deepEqual(
      searchCities('Springfield,').map((p) => p.grid),
      searchCities('Springfield').map((p) => p.grid),
    );
  });
});

describe('a typed Maidenhead locator, offline', () => {
  it('accepts 4 and 6 characters in either case', () => {
    // The search box no longer forces capitals, so lower case has to work.
    assert.ok(isGrid('CN87'));
    assert.ok(isGrid('cn87us'));
    assert.ok(!isGrid('CN8'));
    assert.ok(!isGrid('Seattle'));
  });

  it('lands in the square it names', () => {
    // Round trip: the centre of a square is inside that square.
    for (const grid of ['CN87us', 'PM95', 'JO65', 'FN31pr']) {
      const { lat, lon } = gridToLatLon(grid);
      assert.equal(
        latLonToGrid(lat, lon).slice(0, grid.length).toUpperCase(),
        grid.toUpperCase(),
      );
    }
  });

  it('agrees with a known locator', () => {
    // CN87 is Seattle's square: 2 degrees of longitude from -124 to -122 and
    // 1 of latitude from 47 to 48, so its centre is -123, 47.5.
    const { lat, lon } = gridToLatLon('CN87');
    assert.equal(lat, 47.5);
    assert.equal(lon, -123);
  });
});

describe('cities the source names as it did in 2001', () => {
  it('finds a renamed city under the name in use now', () => {
    // These files predate several renames. A reader typing the name on their
    // own map finding nothing reads as a missing city, not a dated list.
    const pairs: readonly [string, string][] = [
      ['Mumbai', 'Bombay'],
      ['Kolkata', 'Calcutta'],
      ['Chennai', 'Madras'],
      ['Yangon', 'Rangoon'],
      ['Kyiv', 'Kiev'],
      ['Beijing', 'Peking'],
    ];
    for (const [current, old] of pairs) {
      const byCurrent = searchCities(current)[0];
      assert.ok(byCurrent, `no match for ${current}`);
      assert.equal(byCurrent.name, current);

      // And still under the old one, because an operator who has worked the
      // place for thirty years may well type that.
      const byOld = searchCities(old).find((place) => place.name === current);
      assert.ok(byOld, `${old} no longer finds ${current}`);
    }
  });

  it('names countries as they are now, not as the source does', () => {
    // Countries are derived from the coordinate against Natural Earth rather
    // than read from the file, because the file is thirty years out of date in
    // places and misspells others. A position does not go out of date.
    const countryOf = (city: string) => {
      const place = searchCities(city)[0];
      assert.ok(place, `no match for ${city}`);
      return place.country;
    };
    assert.equal(countryOf('Kinshasa'), 'Dem. Rep. Congo'); // not Zaire
    assert.equal(countryOf('Yangon'), 'Myanmar'); // not Burma
    assert.equal(countryOf('Bogota'), 'Colombia'); // not "Columbia"
    assert.equal(countryOf('Quito'), 'Ecuador'); // not "Equador"
    assert.equal(countryOf('Belgrade'), 'Serbia'); // not Yugoslavia
    assert.equal(countryOf('Colombo'), 'Sri Lanka'); // not "SRI Lanka"
  });

  it('gives every place a country', () => {
    // Nearly a fifth of the source rows name no country at all. Two places
    // genuinely resolve to none — a disputed reef and a mid-ocean point — and
    // everything else should have one.
    const missing = searchCities('a').filter((place) => place.country === '');
    assert.deepEqual(missing.map((place) => place.name), []);
  });

  it('keeps the state or constituent country beside it', () => {
    // Natural Earth carries countries, not states, so the source's own
    // sub-national field is what distinguishes the two Aberdeens.
    const found = searchCities('Aberdeen');
    const regions = found.map((place) => `${place.admin1}|${place.country}`);
    assert.ok(
      regions.includes('Scotland|United Kingdom'),
      regions.join(', '),
    );
    assert.ok(
      regions.includes('SD|United States of America'),
      regions.join(', '),
    );
  });

  it('does not shout a place name', () => {
    // The source is all capitals throughout, including accented and
    // slash-separated names that an ASCII test leaves untouched.
    const shouted = searchCities('a').filter((place) => {
      const first = place.name.split(/[ \-./',]/)[0] ?? '';
      return first.length > 1 && first === first.toUpperCase()
        && first !== first.toLowerCase();
    });
    assert.deepEqual(shouted.map((place) => place.name), []);
  });

  it('never shows the old name as the label', () => {
    // The alternate is for matching only. Showing "Leningrad" as a place name
    // would be the app asserting something false.
    const stale = ['Bombay', 'Leningrad', 'Rangoon', 'Calcutta'];
    for (const name of stale) {
      const labels = searchCities(name).map((place) => place.name);
      assert.ok(!labels.includes(name), `${name} is still a label`);
    }
  });
});
