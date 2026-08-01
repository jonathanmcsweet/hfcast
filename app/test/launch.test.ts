import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LAUNCH_STAGES, launchProgress } from '../src/data/launch.ts';

/**
 * The launch screen's bar and step name.
 *
 * Both are read at the one moment the reader has nothing else to judge the app
 * by, so both have to describe real work. The prototype's ran on a timer; what
 * this checks is that this one cannot.
 */

const nothing = { flux: false, ionosonde: false, model: false };

describe('what the launch screen says it is doing', () => {
  it('names the first step that has not finished', () => {
    assert.equal(launchProgress(nothing).stage, 'flux');
    assert.equal(
      launchProgress({ ...nothing, flux: true }).stage,
      'ionosonde',
    );
    assert.equal(
      launchProgress({ flux: true, ionosonde: true, model: false }).stage,
      'model',
    );
  });

  it('does not name a later step just because it finished first', () => {
    // The engine usually beats the network, so `model` settles while `flux` is
    // still in flight. Naming the newest completion would run the label
    // backwards a moment later when the earlier one lands.
    const early = launchProgress({
      flux: false,
      ionosonde: false,
      model: true,
    });
    assert.equal(early.stage, 'flux');
  });

  it('ends on the bands, which is what comes next', () => {
    const done = launchProgress({ flux: true, ionosonde: true, model: true });
    assert.equal(done.stage, 'bands');
    assert.equal(done.progress, 1);
  });

  it('has a name for every stage it can report', () => {
    // A stage with no string renders as its own key over the photograph.
    const reachable = new Set<string>(['bands']);
    for (const flux of [false, true]) {
      for (const ionosonde of [false, true]) {
        for (const model of [false, true]) {
          reachable.add(launchProgress({ flux, ionosonde, model }).stage);
        }
      }
    }
    for (const stage of reachable) {
      assert.ok(
        (LAUNCH_STAGES as readonly string[]).includes(stage),
        `${stage} is not a declared stage`,
      );
    }
  });
});

describe('the bar', () => {
  it('never starts empty, because the app has already done work', () => {
    const start = launchProgress(nothing).progress;
    assert.ok(start > 0 && start < 0.2, `${start}`);
  });

  it('only ever moves forwards as steps settle', () => {
    const run = [
      nothing,
      { ...nothing, flux: true },
      { flux: true, ionosonde: true, model: false },
      { flux: true, ionosonde: true, model: true },
    ].map((status) => launchProgress(status).progress);

    assert.deepEqual([...run].sort((a, b) => a - b), run, `${run}`);
  });

  it('stays inside 0 and 1 whatever settles first', () => {
    for (const flux of [false, true]) {
      for (const ionosonde of [false, true]) {
        for (const model of [false, true]) {
          const { progress } = launchProgress({ flux, ionosonde, model });
          assert.ok(progress >= 0 && progress <= 1, `${progress}`);
        }
      }
    }
  });
});
