/**
 * The grid square's place in every key `useMapRun` builds, in `key` and in
 * `centreKey` alike.
 */
export const GRID_IN_KEY = 2;

/**
 * The answer already on screen, but only where it is about the same place.
 *
 * `keepPreviousData` holds a map up through an adjustment, which is what a
 * reader wants from a band, an hour or a date: those walk through answers
 * about one station, and blanking the map at each step would be worse than
 * a moment of old colours.
 *
 * A move is not that. The projection recentres on the next render, so an
 * answer computed for somewhere else is redrawn against the new centre and
 * the cells land over wherever the reader used to be. It corrects itself
 * when the run finishes, and until then it is a map that looks right and
 * is not. Nothing on screen says to wait, so that is worse than no cells.
 *
 * The fine grid is what makes it last. It replaces the coarse cells
 * outright and takes the longest to compute, so where one is running the
 * old place stays on screen well past the moment the coarse map for the
 * new one has arrived (user, 2026-08-21).
 */
export function heldWhileHere(grid: string) {
  return <T>(
    held: T | undefined,
    previous: { queryKey: readonly unknown[]; } | undefined,
  ) => previous?.queryKey[GRID_IN_KEY] === grid ? held : undefined;
}
