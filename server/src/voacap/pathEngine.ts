/**
 * Which engine answers a path prediction, decided once.
 *
 * There are two. The Rust port is byte-identical to the Fortran reference
 * and `hfcast-engine`'s `paritycheck` confirms it returns the same fields
 * this server reads; the Fortran path is kept so a deployment can fall
 * back without a code change, and so the two can be compared on a live
 * host.
 *
 * They differ in what they take, not in what they answer. The Rust binary
 * reads one request object; `voacapl` reads a fixed-width card deck and
 * prints a listing that has to be parsed back. `predict` used to hold both
 * shapes in one ten-line ternary in the middle of the function that also
 * built the request, applied the corrections and assembled the answer, so
 * the one line that chooses was the hardest line there to find.
 *
 * Behind one function type, the choice is made here at load and `predict`
 * reads as one path.
 */
import type { AntennaCard } from '../antenna.ts';
import { BANDS_BY_FREQ } from '../types.ts';
import { buildDeck } from './deck.ts';
import { type EngineRequest, runEngine } from './engine.ts';
import { type ParsedPrediction, parseVoacapOutput } from './parse.ts';
import { runVoacap } from './run.ts';

/**
 * One path run.
 *
 * The antenna card is passed beside the request because the deck names
 * the file and a beam heading in two of its own fields, where the Rust
 * request carries the whole card as one object.
 */
export type PathEngine = (
  request: EngineRequest,
  txAntenna: AntennaCard | null,
) => Promise<ParsedPrediction>;

const rust: PathEngine = (request) => runEngine(request);

const fortran: PathEngine = async (request, txAntenna) => {
  const { ssn } = request;
  // A deck states a sunspot number and nothing else; the new model's
  // conditioning has no card to go on. Refusing beats silently running
  // the classic physics under the new model's name.
  if (request.engine === 'nowcast' || ssn === undefined) {
    throw new Error('the fortran engine answers only the classic model');
  }
  return parseVoacapOutput(
    await runVoacap(buildDeck({
      ...request,
      ssn,
      ...(txAntenna
        ? { txAntennaFile: txAntenna.file, txBeamDeg: txAntenna.beamDeg }
        : {}),
    })),
    BANDS_BY_FREQ,
  );
};

/** Which engine this process uses. `HFCAST_ENGINE=fortran` picks the old one. */
export const ENGINE_NAME = process.env.HFCAST_ENGINE === 'fortran'
  ? 'fortran'
  : 'rust';

export const runPath: PathEngine = ENGINE_NAME === 'fortran' ? fortran : rust;
