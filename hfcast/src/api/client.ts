import type { Place, PredictionResponse, SpaceWeather } from '../data/types';

/**
 * Where the prediction server lives. Set EXPO_PUBLIC_HFCAST_API to point a
 * device or simulator at a machine other than the one running Metro.
 */
export const API_BASE = process.env.EXPO_PUBLIC_HFCAST_API
  ?? 'http://127.0.0.1:8787';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function getJson<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== '') url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    let message = `request failed with ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; };
      if (body.error) message = body.error;
    } catch {
      // Keep the status-based message.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export interface PredictionParams {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  /** ISO date, UTC. */
  date: string;
  /** Ask the server to drive the run from current conditions. */
  nowcast: boolean;
}

export function fetchPrediction(
  p: PredictionParams,
): Promise<PredictionResponse> {
  return getJson<PredictionResponse>('/api/prediction', {
    from: p.from,
    to: p.to,
    fromLabel: p.fromLabel,
    toLabel: p.toLabel,
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
  });
}

export function fetchGeocode(query: string, lang: string): Promise<Place[]> {
  return getJson<Place[]>('/api/geocode', { q: query, lang });
}

export function fetchSpaceWeather(): Promise<SpaceWeather> {
  return getJson<SpaceWeather>('/api/spaceweather', {});
}
