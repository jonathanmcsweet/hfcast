/**
 * Filling the other bands in behind the map.
 *
 * The map is corrected against a lattice of daily middles, one per band.
 * The band on screen gets its lattice in front of the reader, because
 * the fine grid cannot be drawn correctly without it. The other eight
 * are wanted too — a band change is instant once its lattice is held —
 * but nobody is waiting for them, so they are filled in afterwards.
 *
 * "Afterwards" has to be taken literally. The engine module runs one
 * request at a time and cannot be interrupted, so work started behind
 * the map runs in front of whatever the reader asks for next. A previous
 * attempt at this made a band change take about 30 seconds against 3.4
 * for the run alone (user, 2026-08-01). Two things stop that happening
 * here: everything goes through one queue that always prefers the
 * reader's own work (`engineQueue.ts`), and each lattice is cut into
 * strips so the longest a reader can wait behind background work is one
 * strip.
 *
 * Filling stops at the band the reader moves to: its lattice is now the
 * urgent one, and any strips still queued for other bands are given up.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { FINE_CENTRE_LAT_STEP, FINE_CENTRE_LON_STEP } from '../data/correctMap';
import { dropLater, wasDropped } from '../data/engineQueue';
import { centresLocally } from '../data/localCoverage';
import { BAND_ORDER, type BandKey } from '../data/types';

/** What `runLater` matches on when filling is given up. */
const FILL_GROUP = 'band-fill';

/**
 * How long the fill waits before it starts.
 *
 * The queue already puts the reader's work first, but only among pieces
 * that have not started: one background strip handed over at the wrong
 * moment still has to finish. At the moment the screen opens, everything
 * the reader is waiting for is about to be asked for and none of it has
 * been queued yet, so this is exactly the moment a background piece
 * could get in front. Waiting removes the race rather than narrowing it.
 *
 * Long enough for the coarse map, its lattice and the fine grid to be
 * asked for on a slow device; short enough that a reader who settles on
 * one band has the others soon after.
 */
const FILL_DELAY_MS = 8000;

/** Which bands have their lattice, and which one is being worked on. */
export interface BandFill {
  /** Bands whose correction is ready. */
  ready: ReadonlySet<BandKey>;
  /** The band being computed now, or null when nothing is. */
  working: BandKey | null;
}

/**
 * What a caller needs to start the fill.
 *
 * Passed in rather than worked out here, because it is exactly what
 * `useMapRun` already holds and a second copy of that reasoning is how
 * two callers end up asking for different lattices.
 */
export interface FillInputs {
  local: boolean;
  enabled: boolean;
  band: BandKey;
  /** The engine request, without the band. */
  engine: Parameters<typeof centresLocally>[0];
  /** The cache key for one band's fine lattice. */
  keyFor: (band: BandKey) => readonly unknown[];
}

export function useBandFill(inputs: FillInputs): BandFill {
  const client = useQueryClient();
  const [working, setWorking] = useState<BandKey | null>(null);
  const [ready, setReady] = useState<ReadonlySet<BandKey>>(new Set());
  const { local, enabled, band } = inputs;

  // The request and the key builder are rebuilt on every render by
  // `useMapRun`, so depending on them would restart the fill on every
  // frame and it would never get past its first band. Held in a box the
  // effect reads through instead: what actually decides the work is the
  // band, whether the engine is in this build, and whether runs are
  // allowed at all.
  const latest = useRef(inputs);
  latest.current = inputs;

  useEffect(() => {
    if (!local || !enabled) return;

    // The band on screen is not filled in here. It is the reader's own
    // work and `useFineCentres` is already asking for it in front.
    const wanted = BAND_ORDER.filter((each) => each !== band);
    let stopped = false;

    const fill = async () => {
      // A loop rather than `map` or `reduce`, for two things neither can
      // express.
      //
      // It has to be sequential. `wanted.map(...)` starts all eight
      // bands at once, which puts every strip of every band in the queue
      // together — and the cutting into strips is the whole of what
      // keeps the reader's next request close behind.
      //
      // It has to stop part-way. When the reader changes band the rest
      // of the fill is abandoned. A `reduce` that chains promises can
      // sequence them, but it builds every continuation up front and
      // has nowhere to return from.
      for (const each of wanted) {
        if (stopped) return;
        const { engine, keyFor } = latest.current;
        if (client.getQueryData(keyFor(each)) !== undefined) {
          setReady((held) => new Set([...held, each]));
          continue;
        }
        setWorking(each);
        try {
          const one = await centresLocally(
            engine,
            FINE_CENTRE_LAT_STEP,
            FINE_CENTRE_LON_STEP,
            each,
            { group: FILL_GROUP },
          );
          if (stopped) return;
          client.setQueryData(keyFor(each), one[each]);
          setReady((held) => new Set([...held, each]));
        } catch (e) {
          // A piece given up because the reader moved is not a fault.
          // A real failure means this band stays uncorrected until it is
          // the one on screen, which is a slower map and not a wrong one.
          if (!wasDropped(e)) setReady((held) => held);
        }
      }
      if (!stopped) setWorking(null);
    };

    const begin = setTimeout(() => {
      if (!stopped) void fill();
    }, FILL_DELAY_MS);

    return () => {
      stopped = true;
      clearTimeout(begin);
      setWorking(null);
      dropLater(FILL_GROUP);
    };
  }, [local, enabled, band, client]);

  return { ready, working };
}
