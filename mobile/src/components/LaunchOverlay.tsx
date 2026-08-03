import React, { useCallback, useEffect, useState } from 'react';

import { usePrediction, useSounding, useSpaceWeather } from '../api/queries';
import { LAUNCH_FLOOR_MS, launchProgress } from '../data/launch';
import { usePathStore } from '../store/usePathStore';
import LaunchScreen from './LaunchScreen';

/**
 * Holds the launch screen over the app until there is something to show.
 *
 * It sits above the screen rather than inside it so the screen can mount and
 * do its work underneath — which is what makes the fade a fade rather than a
 * cut to an empty frame.
 *
 * The three queries here are the same three the screen runs. React Query
 * serves both from one entry per key, so subscribing twice costs nothing and
 * fetches nothing extra; it is how this can watch the real work without
 * reaching into the screen.
 */
export default function LaunchOverlay() {
  const from = usePathStore((s) => s.from);
  const to = usePathStore((s) => s.to);

  const weather = useSpaceWeather();
  const sounding = useSounding(from);
  const prediction = usePrediction(from, to);

  // Rendered until the fade finishes, then never again this session.
  const [gone, setGone] = useState(false);
  const [floorPassed, setFloorPassed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setFloorPassed(true), LAUNCH_FLOOR_MS);
    return () => clearTimeout(id);
  }, []);

  const onHidden = useCallback(() => setGone(true), []);

  if (gone) return null;

  const { stage, progress } = launchProgress({
    flux: !weather.isPending,
    // A query held back because no station is near enough never fetches, so
    // it stays pending forever. That is a settled answer — there is nothing
    // to wait for — and `fetchStatus` is what says so.
    ionosonde: !sounding.isPending || sounding.fetchStatus === 'idle',
    model: !prediction.isPending,
  });

  // Only the engine is waited for. The two network steps are named as they
  // finish but never hold the screen: space weather can take sixteen seconds
  // to fail on a dead connection, and a forecast the device already has
  // should not sit behind that.
  const visible = !floorPassed || prediction.isPending;

  return (
    <LaunchScreen
      stage={stage}
      progress={progress}
      visible={visible}
      onHidden={onHidden}
    />
  );
}
