import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Where the prediction server is.
 *
 * It used to be fixed when the app was built, from `EXPO_PUBLIC_HFCAST_API`.
 * That is right for a simulator and wrong for a phone: an installed APK
 * carried `http://127.0.0.1:8787`, which on a phone means the phone itself,
 * so every forecast failed and the only way to change it was another build.
 *
 * Held here so one build can be pointed at a laptop on the same network
 * today and a tunnel tomorrow. The build-time value is still the default,
 * so nothing changes for anyone running the app beside the server.
 */

/** The value a fresh install starts from. */
export const DEFAULT_ADDRESS = process.env.EXPO_PUBLIC_HFCAST_API
  ?? 'http://127.0.0.1:8787';

/**
 * Cleans up what somebody typed, or returns null if it cannot be used.
 *
 * Deliberately forgiving about the parts people leave out — a bare
 * `192.168.1.5:8787` is what an operator reads off their own network, and
 * refusing it in favour of a lecture about schemes would be pedantry. A
 * trailing slash is removed because every path in the client starts with one.
 */
export function normaliseAddress(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.hostname === '') return null;
    // Only the origin is kept. A path, a query or a fragment would end up
    // concatenated in front of `/forecast` and fail in a way that reads as
    // the server being down.
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Whether an address points at the device running the app.
 *
 * Worth saying out loud in the error message: "could not reach 127.0.0.1"
 * looks like a server problem, and on a phone it is a configuration problem —
 * there was never going to be a server there.
 */
export function isLoopback(address: string): boolean {
  try {
    const { hostname } = new URL(address);
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === '::1'
      || hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

interface ServerState {
  address: string;
  /** Returns false when the text could not be read as an address. */
  setAddress: (input: string) => boolean;
  reset: () => void;
}

export const useServerStore = create<ServerState>()(
  persist(
    (set) => ({
      address: DEFAULT_ADDRESS,
      setAddress: (input) => {
        const address = normaliseAddress(input);
        if (address === null) return false;
        set({ address });
        return true;
      },
      reset: () => set({ address: DEFAULT_ADDRESS }),
    }),
    {
      name: 'hfcast-server',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

/**
 * The current address for code outside React.
 *
 * The API client is plain functions called by React Query, not a hook, so it
 * reads the store directly. Every query key includes this value, so a change
 * refetches rather than showing an answer from a different server.
 */
export const serverAddress = (): string => useServerStore.getState().address;
