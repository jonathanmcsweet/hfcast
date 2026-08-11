import { useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';

import type { ReachBox } from '../../data/cellField';
import { clamp, containView, MIN_SCALE } from '../../data/projection';
import type { MapView } from '../../data/projection';

/**
 * Where the map is pointed, and the gestures that move it.
 *
 * Split from the drawing because it is the only stateful part of the
 * globe and it has rules of its own that have nothing to do with
 * geometry: how far in the map may go, how many fingers claim a pan, and
 * what happens when one of them lifts.
 */

/**
 * How far in the map will go.
 *
 * This was 10, on the reasoning that past it the grid is coarser than
 * the pixels. That reasoning was about the 15 by 22.5 degree grid, and
 * it stopped being true when the fine grid arrived: the patch follows
 * the view and buys a finer step as the rectangle shrinks, so zooming
 * in now asks a better question rather than magnifying the same answer.
 *
 * 30 is where that stops. The ladder's finest rung is 0.625 by 0.75
 * degrees and it is only reached when the visible half-height is under
 * about 3 degrees, which on a 322 px map is a scale near 30. Past that
 * the cells would be magnified again with nothing further to ask for.
 */
export const MAX_SCALE = 30;
const ZOOM_STEP = 1.6;

export const WHOLE_GLOBE: MapView = { scale: MIN_SCALE, cxF: 0.5, cyF: 0.5 };

/** A drag has to beat this before it takes over, so a tap stays a tap. */
const DRAG_SLOP = 3;

/**
 * Fingers on the map before it moves.
 *
 * One finger belongs to the page. The map fills most of the screen, so
 * claiming a single-finger drag meant a scroll that began over the map panned
 * the map instead — a gesture that reads as "move the list" doing something
 * else entirely, with no way to tell in advance which it would be. Two fingers
 * is the pattern a scrollable map inside a scrollable page usually takes, and
 * it also leaves the single finger free for tapping a square.
 */
const PAN_FINGERS = 2;

export function useGlobeView(
  size: number,
  onPanning: ((active: boolean) => void) | undefined,
) {
  const [view, setView] = useState<MapView>(WHOLE_GLOBE);

  // The gesture handlers are made once and read the view through a ref.
  // Rebuilding them when the view changes would replace the responder in
  // the middle of a drag.
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragFrom = useRef<MapView | null>(null);
  // Through a ref for the same reason as the view: the responder is made
  // once, and it must always call the caller's current listener.
  const onPanningRef = useRef(onPanning);
  onPanningRef.current = onPanning;

  const zoom = (factor: number) =>
    setView((v) =>
      containView({
        ...v,
        scale: clamp(v.scale * factor, MIN_SCALE, MAX_SCALE),
      })
    );

  const pan = useMemo(() => {
    // Every way a pan can end goes through here, because the page's
    // scroller is turned off while one is running and something has to
    // turn it back on. A pan can end with touches still on the screen,
    // which is the case the two handlers below do not cover.
    const endPan = () => {
      dragFrom.current = null;
      onPanningRef.current?.(false);
    };

    return PanResponder.create({
      // False on start so a press still reaches the buttons above.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (event, gesture) =>
        viewRef.current.scale > MIN_SCALE
        && event.nativeEvent.touches.length >= PAN_FINGERS
        && (Math.abs(gesture.dx) > DRAG_SLOP
          || Math.abs(gesture.dy) > DRAG_SLOP),
      // Never give the gesture up while a pan is running. The default
      // answer is yes, and on Android the page's scroller asks the moment
      // a pan has any vertical part — so pans died mid-gesture, a little
      // scroll happened instead, and two-finger panning felt hesitant.
      //
      // Once the pan has ended the hold goes with it. Held past that, a
      // map that ignores every move still owned the gesture and the page
      // could not scroll either, so nothing on the screen answered a
      // touch until the last finger came off.
      onPanResponderTerminationRequest: () => dragFrom.current === null,
      onPanResponderGrant: () => {
        dragFrom.current = viewRef.current;
        onPanningRef.current?.(true);
      },
      onPanResponderMove: (event, gesture) => {
        const start = dragFrom.current;
        if (start === null) return;
        // A finger lifted mid-drag ends the pan rather than turning it into
        // a one-finger one. Otherwise letting go of one finger would carry
        // on moving the map, which is the behaviour this avoids.
        if (event.nativeEvent.touches.length < PAN_FINGERS) {
          endPan();
          return;
        }
        // The map follows the finger, so the window moves the other way.
        // Screen pixels become disc pixels by dividing by the scale.
        setView(
          containView({
            scale: start.scale,
            cxF: start.cxF - gesture.dx / (size * start.scale),
            cyF: start.cyF - gesture.dy / (size * start.scale),
          }),
        );
      },
      onPanResponderRelease: endPan,
      onPanResponderTerminate: endPan,
    });
  }, [size]);

  /** Frames where this band reaches, with a tenth of margin around it. */
  const fitTo = (box: ReachBox | null) => {
    if (box === null) return;
    const width = Math.max(1, box.maxX - box.minX);
    const height = Math.max(1, box.maxY - box.minY);
    // A tenth of margin, so the edge cells are inside the frame rather
    // than cut by it.
    const scale = clamp(
      (size / Math.max(width, height)) * 0.9,
      MIN_SCALE,
      MAX_SCALE,
    );
    setView(containView({
      scale,
      cxF: (box.minX + box.maxX) / 2 / size,
      cyF: (box.minY + box.maxY) / 2 / size,
    }));
  };

  return {
    view,
    pan,
    zoomIn: () => zoom(ZOOM_STEP),
    zoomOut: () => zoom(1 / ZOOM_STEP),
    fitTo,
    showWholeGlobe: () => setView(WHOLE_GLOBE),
    zoomedIn: view.scale > MIN_SCALE,
    atWholeGlobe: view.scale <= MIN_SCALE && view.cxF === 0.5
      && view.cyF === 0.5,
    atMaxScale: view.scale >= MAX_SCALE,
  };
}
