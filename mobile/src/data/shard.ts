/**
 * Cutting one area run into strips — see `shared/shard.ts`.
 *
 * The server splits across processes and the app across threads, but both
 * have to reproduce the grid one run would have produced, so the
 * arithmetic is one module rather than two copies.
 */
export * from '../../../shared/shard.ts';
