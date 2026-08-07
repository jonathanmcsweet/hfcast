import ReachLines from '../../src/components/reach/ReachLines';
import type { BandKey, Coverage } from '../../src/data/types';
import { renderWithApp } from './harness';

/**
 * The sentences under the map.
 *
 * Both figures come from grids that arrive separately, so after a band
 * change one of them can still be the previous band's. Every sentence
 * therefore names the band its own grid answered for, and the two are
 * only joined into one sentence where they agree. That rule is the whole
 * of this component and it cannot be seen from the map.
 */

const coverageOf = (band: BandKey): Coverage => ({
  band,
  hour: 12,
  reach: 0.4,
  lonStep: 22.5,
  latStep: 15,
  basis: 'climatology',
  points: [],
});

describe('the reach sentences', () => {
  it('says it in one sentence where both figures are the same band', async () => {
    const view = await renderWithApp(
      <ReachLines coverage={coverageOf('40m')} nvisBand="40m" nvisKm={400} />,
    );

    expect(view.getAllByText(/40m/).length).toBe(1);
  });

  it('keeps them apart where the grids answered for different bands', async () => {
    const view = await renderWithApp(
      <ReachLines coverage={coverageOf('40m')} nvisBand="160m" nvisKm={400} />,
    );

    // Two sentences, each naming its own band. Joined, one of the two
    // figures would be filed under the other's band and no reader could
    // catch it.
    expect(view.getByText(/40m/)).toBeTruthy();
    expect(view.getByText(/160m/)).toBeTruthy();
  });

  it('says nothing about a reading it does not have', async () => {
    const view = await renderWithApp(
      <ReachLines coverage={undefined} nvisBand={null} nvisKm={null} />,
    );

    // No sentence at all, rather than one about a missing figure.
    expect(view.queryByText(/./)).toBeNull();
  });
});
