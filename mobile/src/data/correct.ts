/**
 * The empirical correction applied to every run — see `shared/correct.ts`.
 *
 * The factors were fitted against WSPR reception reports and are the same
 * numbers on both sides. Two sets would give one station two different
 * forecasts depending on which path answered it.
 */
export * from '../../../shared/correct.ts';
