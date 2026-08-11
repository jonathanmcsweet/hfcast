/**
 * Computed maps, kept on disk.
 *
 * A whole-world fine grid takes about a second and a half on a modern
 * phone and far longer on the old tablets this app is for. The answer is
 * monthly climatology, so the one computed this morning is still right
 * on the last day of the month — and a person who computed a month, or a
 * year, at home on a charger should not have to compute any of it again
 * on a hill with no network and no way to charge.
 *
 * So every map computed without a live space weather reading is written
 * here, and read back instead of run again.
 *
 * Only maps without a now-cast are kept, and that is the whole rule.
 * A map computed from a live reading is filed under that reading, the
 * reading is polled every fifteen minutes, and no such map can ever be
 * read again — storing one would spend a cheap device's flash on a file
 * that is already dead. What is left is exactly what is useful away from
 * a network: the field case is offline, offline has no reading, and so
 * every map made in the field is stored and every map stored is one the
 * field can use.
 *
 * Nothing here fails loudly. A map that cannot be read is a map that has
 * to be computed, which is what the app did before any of this existed,
 * so every failure here returns "no" and the caller carries on.
 */
import * as Engine from '../../modules/engine-bridge';
import { timing } from './diagnostics';
import { decodeGlobe, encodeGlobe } from './globeCodec';
import {
  type Listed,
  type MapIdentity,
  readName,
  storedName,
  toDrop,
} from './globeName';
import type { FineGlobe } from './types';

export type { MapIdentity, MapPlace } from './globeName';
export { placeName } from './globeName';

/** Whether this build keeps maps at all. False on web and older builds. */
export const canStore = (): boolean => Engine.canStoreMaps();

/**
 * Reads one stored map, or null.
 *
 * Null covers every reason there is no map to draw: none was stored,
 * the file was half written, it came from a build that wrote a different
 * format, or the device refused the read. The caller computes one, so
 * none of them is worth telling anybody about.
 *
 * The map is checked against the name it was filed under before it is
 * believed. A file says which band and hour it holds, and if that
 * disagrees with what was asked then something is wrong that no amount
 * of reading further will fix.
 */
export async function readGlobe(id: MapIdentity): Promise<FineGlobe | null> {
  if (!canStore()) return null;
  try {
    const bytes = await Engine.readMapCache(storedName(id));
    if (bytes === null) return null;
    const grid = decodeGlobe(bytes);
    if (grid.band !== id.band || grid.hour !== id.hour) {
      timing('stored map does not match its name', {
        asked: `${id.band} at ${id.hour}`,
        held: `${grid.band} at ${grid.hour}`,
      });
      return null;
    }
    return grid;
  } catch (e) {
    timing('stored map could not be read', { why: String(e) });
    return null;
  }
}

/**
 * Keeps one computed map, and says whether it was kept.
 *
 * False rather than a failure when there is no room, no store, or a
 * device that refuses the write. Storing a map is an improvement on
 * computing one, never a requirement, so nothing upstream should have to
 * handle it not happening.
 */
export async function keepGlobe(
  id: MapIdentity,
  grid: FineGlobe,
): Promise<boolean> {
  if (!canStore()) return false;
  try {
    await Engine.writeMapCache(storedName(id), encodeGlobe(grid));
    return true;
  } catch (e) {
    timing('a map could not be stored', { why: String(e) });
    return false;
  }
}

/**
 * Every stored map, or nothing where they cannot be listed.
 *
 * Anything whose name this build does not recognise is left out, so a
 * file that is not one of ours is neither counted against the room
 * allowed nor deleted to make some.
 */
export async function listStored(): Promise<readonly Listed[]> {
  if (!canStore()) return [];
  try {
    const listed = await Engine.listMapCache();
    return listed.filter((one) => readName(one.name) !== null);
  } catch (e) {
    timing('the stored maps could not be listed', { why: String(e) });
    return [];
  }
}

/** How much room the stored maps take, in bytes. */
export const storedBytes = async (): Promise<number> =>
  (await listStored()).reduce((all, one) => all + one.bytes, 0);

/**
 * Drops the least recently opened maps until the rest fit.
 *
 * Returns how many went. Called after storing rather than before, so a
 * map is never dropped to make room for one that then fails to arrive.
 */
export async function makeRoom(budgetBytes: number): Promise<number> {
  if (!canStore()) return 0;
  try {
    const doomed = toDrop(await listStored(), budgetBytes);
    if (doomed.length === 0) return 0;
    const gone = await Engine.removeMapCache(doomed);
    timing('stored maps dropped to make room', {
      dropped: gone,
      budget: budgetBytes,
    });
    return gone;
  } catch (e) {
    timing('room could not be made', { why: String(e) });
    return 0;
  }
}

/** Drops every stored map, for the button that says so. */
export async function forgetStored(): Promise<number> {
  if (!canStore()) return 0;
  try {
    const listed = await listStored();
    return await Engine.removeMapCache(listed.map((one) => one.name));
  } catch (e) {
    timing('the stored maps could not be dropped', { why: String(e) });
    return 0;
  }
}
