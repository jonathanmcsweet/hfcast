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
import type { BandHourPrediction, BandKey } from '../types.ts';

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
 * the correction moves the median.
 */
export interface RawBandHour extends BandHourPrediction {
  snrLowDecile: number | null;
  snrUpDecile: number | null;
}

export interface ParsedPrediction {
  /** Median MUF in MHz per UTC hour, index 0-23. */
  mufByHour: number[];
  cells: RawBandHour[];
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
const ROWS = ['REL', 'SNR', 'SNR LW', 'SNR UP'] as const;
type RowLabel = (typeof ROWS)[number];

export function parseVoacapOutput(
  listing: string,
  bands: readonly BandKey[],
): ParsedPrediction {
  const lines = listing.split('\n');
  const cells: RawBandHour[] = [];
  const mufByHour = Array<number>(24).fill(0);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (labelOf(line) !== 'FREQ') continue;

    const hourRaw = Number(line.slice(0, 6).trim());
    if (!Number.isFinite(hourRaw)) continue;
    const hour = normaliseHour(hourRaw);

    const muf = Number(line.slice(6, FIRST_SLOT).trim());
    if (Number.isFinite(muf)) mufByHour[hour] = muf;

    // Rows belonging to this hour run until the next FREQ line.
    const bySlot = new Map<RowLabel, Map<number, number>>(
      ROWS.map((row) => [row, new Map()]),
    );

    for (let j = i + 1; j < lines.length; j += 1) {
      const row = lines[j];
      if (row === undefined) break;
      const label = labelOf(row);
      if (label === 'FREQ') break;

      const target = bySlot.get(label as RowLabel);
      if (target === undefined) continue;
      for (let s = 0; s < SLOT_COUNT; s += 1) {
        const value = slot(row, s);
        if (value !== null) target.set(s, value);
      }
    }

    bands.forEach((band, index) => {
      const rel = bySlot.get('REL')?.get(index);
      const snr = bySlot.get('SNR')?.get(index);
      if (rel === undefined || snr === undefined) return;
      cells.push({
        hour,
        band,
        // The listing clamps to two decimals; keep it in 0..1 regardless.
        reliability: Math.min(1, Math.max(0, rel)),
        snr,
        snrLowDecile: bySlot.get('SNR LW')?.get(index) ?? null,
        snrUpDecile: bySlot.get('SNR UP')?.get(index) ?? null,
      });
    });
  }

  return { mufByHour, cells };
}
