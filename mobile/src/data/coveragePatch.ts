/**
 * The fine grid drawn around the operator — see `shared/coveragePatch.ts`.
 *
 * This file was a character-for-character copy of the server's, held
 * there by a test that compared the two as text. Both now import the one
 * module; this re-export exists so the app's own modules keep naming a
 * file under `src/data/`, which is where everything else about the map
 * lives.
 */
export * from '../../../shared/coveragePatch.ts';
