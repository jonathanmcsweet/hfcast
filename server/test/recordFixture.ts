/**
 * Records the Fortran listing the tests compare against.
 *
 * Run it whenever the deck changes — a band added, a card altered — and
 * commit what it writes. Needs `voacapl` and an itshfbc tree on the
 * machine; see `server/README.md`.
 *
 *   pnpm record-fixture
 */
import { writeFileSync } from 'node:fs';

import { buildDeck } from '../src/voacap/deck.ts';
import { runVoacap } from '../src/voacap/run.ts';
import { FIXTURE_PATH, FIXTURE_REQUEST } from './fixtureRequest.ts';

const listing = await runVoacap(buildDeck(FIXTURE_REQUEST));
writeFileSync(FIXTURE_PATH, listing, 'utf8');
console.log(`recorded ${FIXTURE_PATH}`);
