/**
 * Parses a VOACAP method 30 output listing.
 *
 * The listing is a paginated fixed-width table. Each hour is one block that
 * starts with a line ending in `FREQ` and continues with labelled rows. Within
 * a block every row shares the same column geometry:
 *
 *   columns 0-5    the UTC hour (only on the FREQ line)
 *   columns 6-10   the value at the MUF
 *   columns 11-65  eleven 5-wide frequency slots
 *   columns 66-    the row label
 *
 * Splitting on whitespace looks tempting and is wrong: a value that fills its
 * field runs into its neighbour, so `9.7011.85` is two numbers, not one. The
 * label is read from its column rather than as the line's last word, because
 * labels contain spaces and `SNR LW` and `SIG LW` share a last word.
 */
import type { RawBandHour } from '../../../shared/bands.ts';
import type { BandHourPrediction, BandKey, OperatingWindow } from '../types.ts';

const FIRST_SLOT = 11;
const SLOT_WIDTH = 5;
const SLOT_COUNT = 11;
const LABEL_START = 66;

/**
 * One parsed cell, before the empirical correction.
 *
 * The deciles describe the day-to-day spread of the SNR distribution: the
 * median minus `snrLowDecile` is exceeded on 90% of days, the median plus
 * `snrUpDecile` on 10%. They are what lets reliability be recomputed after
 * the correction moves the median — which the correction does on both
 * sides, so the shape is in `shared/bands.ts`.
 */
export type { RawBandHour };

export interface ParsedPrediction {
  /** Median MUF in MHz per UTC hour, index 0-23. */
  mufByHour: number[];
  cells: RawBandHour[];
  /**
   * Null from the Fortran path, which would need a second `voacapl` run
   * with a method-26 deck to produce it. That path exists as a fallback
   * and is due for removal once the parity soak passes, so it was not
   * worth a second run there. Consumers must treat the window as
   * optional for that reason alone.
   */
  window: OperatingWindow | null;
}

/** One 5-column slot, or null where the listing prints a dash. */
function slot(line: string, index: number): number | null {
  const start = FIRST_SLOT + index * SLOT_WIDTH;
  const raw = line.slice(start, start + SLOT_WIDTH).trim();
  if (raw === '' || raw === '-') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * The label a listing row carries in its label column. The echoed input deck
 * has no label column, so its cards read as empty here.
 */
function labelOf(line: string): string {
  return line.length > LABEL_START ? line.slice(LABEL_START).trim() : '';
}

/**
 * VOACAP numbers hours 1..24, where 24 means midnight at the end of the day.
 * The app indexes 0..23, so 24 folds to 0.
 */
function normaliseHour(raw: number): number {
  return Math.round(raw) % 24;
}

/** The row labels one hour block contributes to a cell. */
const ROWS = ['REL', 'SNR', 'SNR LW', 'SNR UP', 'TANGLE'] as const;
type RowLabel = (typeof ROWS)[number];

/** One hour's block: the `FREQ` line that opens it and the rows under it. */
interface HourBlock {
  head: string;
  rows: readonly string[];
}

/**
 * Cuts the listing into hour blocks.
 *
 * A block opens on a `FREQ` line and runs to the next one. Found by
 * locating the openings first and then slicing between them, rather than
 * folding line by line: the boundary of one block is the start of the
 * next, so the positions are the natural thing to compute. Anything
 * before the first `FREQ` line is the echoed input deck and the page
 * header, and belongs to no block.
 */
function hourBlocks(lines: readonly string[]): readonly HourBlock[] {
  const starts = lines.flatMap((line, index) =>
    labelOf(line) === 'FREQ' ? [index] : []
  );
  return starts.map((start, nth) => ({
    head: lines[start] ?? '',
    rows: lines.slice(start + 1, starts[nth + 1] ?? lines.length),
  }));
}

/**
 * Every value one block printed, as row label then slot index.
 *
 * A label appearing twice keeps the last one, which is what building the
 * map from a list of entries does and what the block scan did before it.
 */
function valuesOf(block: HourBlock): Map<RowLabel, Map<number, number>> {
  return new Map(
    ROWS.map((row) => [
      row,
      new Map(
        block.rows
          .filter((line) => labelOf(line) === row)
          .flatMap((line) =>
            Array.from(
              { length: SLOT_COUNT },
              (_, index) => [index, slot(line, index)] as const,
            )
          )
          .filter((entry): entry is [number, number] => entry[1] !== null),
      ),
    ]),
  );
}

export function parseVoacapOutput(
  listing: string,
  bands: readonly BandKey[],
): ParsedPrediction {
  const blocks = hourBlocks(listing.split('\n'))
    .map((block) => ({
      block,
      hour: Number(block.head.slice(0, 6).trim()),
      muf: Number(block.head.slice(6, FIRST_SLOT).trim()),
    }))
    // A `FREQ` line whose first column is not a number is a header
    // repeated by the pagination, not an hour.
    .filter((entry) => Number.isFinite(entry.hour))
    .map((entry) => ({
      ...entry,
      hour: normaliseHour(entry.hour),
      values: valuesOf(entry.block),
    }));

  // Zero for an hour the listing never printed, which is how the rest of
  // the server reads a missing MUF. A later block wins, as it did when
  // this was an assignment into the array.
  const muf = new Map(
    blocks
      .filter((entry) => Number.isFinite(entry.muf))
      .map((entry) => [entry.hour, entry.muf]),
  );
  const mufByHour = Array.from({ length: 24 }, (_, hour) => muf.get(hour) ?? 0);

  const cells: readonly RawBandHour[] = blocks.flatMap(({ hour, values }) =>
    bands
      .map((band, index) => ({
        band,
        rel: values.get('REL')?.get(index),
        snr: values.get('SNR')?.get(index),
        snrLowDecile: values.get('SNR LW')?.get(index) ?? null,
        snrUpDecile: values.get('SNR UP')?.get(index) ?? null,
        takeoffAngleDeg: values.get('TANGLE')?.get(index) ?? null,
      }))
      // A band with no reliability or no signal-to-noise is a slot the
      // listing did not print at all, not a closed band.
      .filter((row) => row.rel !== undefined && row.snr !== undefined)
      .map((row) => ({
        hour,
        band: row.band,
        // The listing clamps to two decimals; keep it in 0..1 regardless.
        reliability: Math.min(1, Math.max(0, row.rel as number)),
        snr: row.snr as number,
        snrLowDecile: row.snrLowDecile,
        snrUpDecile: row.snrUpDecile,
        takeoffAngleDeg: row.takeoffAngleDeg,
      }))
  );

  // No window: a method-30 listing prints neither the LUF nor the FOT.
  return { mufByHour, cells: [...cells], window: null };
}
