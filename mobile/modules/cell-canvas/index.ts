import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';

/**
 * The cell field, drawn by Android's own Canvas.
 *
 * `requireNativeViewManager` rather than SDK 57's `requireNativeView`: the
 * older call is in both Expo SDKs, which is what lets the Android 5.0 build
 * use this file unchanged.
 */

/** One filled path. The caller has already resolved the colour. */
export interface Layer {
  d: string;
  color: string;
  opacity: number;
}

export interface CellCanvasProps {
  /** Coarse cells, then the patch backing, then the patch. Drawn in order. */
  layers: Layer[];
  /** The stipple, flattened to x, y, x, y. */
  dots: number[];
  disc: { cx: number; cy: number; radius: number; color: string; };
  dot: { radius: number; color: string; opacity: number; };
  transform: { tx: number; ty: number; scale: number; };
  style?: Record<string, unknown>;
}

export const CellCanvasView: ComponentType<CellCanvasProps> =
  requireNativeViewManager<CellCanvasProps>('CellCanvas');

export default CellCanvasView;
