import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { PaperProvider, Portal } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '../../src/i18n/index';
import { lightTheme } from '../../src/theme';

/**
 * How long react-native-paper waits before it draws a placeholder.
 *
 * `TextInput` holds the placeholder back by this much so that it does not
 * overlap the label while the label moves. It does that with a timer, and
 * the timer sets state after the first paint. A test that only waits for
 * the first paint therefore leaves a state change running loose behind
 * it, and React says so: "An update to ForwardRef inside a test was not
 * wrapped in act(...)". The warning only appears when the test is still
 * running 50 ms later, so it comes and goes between runs.
 *
 * Keep this equal to the delay in `TextInput.tsx` in react-native-paper.
 * If the two disagree, the harness waits too little and the warning comes
 * back, or it waits too long and every render test is slower.
 */
const PAPER_PLACEHOLDER_DELAY_MS = 50;

/** A margin, so the wait ends after the delay above and not with it. */
const SETTLE_MARGIN_MS = 5;

/**
 * The providers a component needs to render, and nothing else.
 *
 * The same four the app mounts — the query client, the language, the
 * theme and the safe area — because a component that reads `ui.accent`
 * off the theme or asks for a translation gets undefined without them,
 * and a test that fails for that reason is testing the harness.
 *
 * The query client retries nothing and holds nothing between tests, so a
 * component that fetches fails once, quickly, and predictably.
 *
 * `SafeAreaProvider` is given the frame and insets outright. Measured, it
 * reports zeroes on the first pass and the real values one frame later,
 * which makes anything positioned against an inset arrive in two states.
 *
 * Awaited, because the library's own `render` is: it wraps the first
 * paint in `act`, so the tree is only settled once the promise resolves.
 * The first paint is not the whole of it, though — a component can start
 * a timer as it mounts and change state when that timer ends. This waits
 * for that too. See `PAPER_PLACEHOLDER_DELAY_MS` below.
 *
 * Icons draw nothing. The font is loaded by the app at boot and there is
 * no boot here, so every icon in the tree would otherwise print a warning
 * about a missing icon library. Nothing is asserted against an icon: they
 * carry no text, so a label is what a screen reader announces and a label
 * is what these tests look for.
 */
export async function renderWithApp(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const Wrapper = ({ children }: { children: ReactNode; }) => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <PaperProvider theme={lightTheme} settings={{ icon: () => null }}>
          <SafeAreaProvider
            initialMetrics={{
              frame: { x: 0, y: 0, width: 390, height: 844 },
              insets: { top: 47, left: 0, right: 0, bottom: 34 },
            }}
          >
            {/* Modals and dialogs are drawn into this. */}
            <Portal.Host>{children}</Portal.Host>
          </SafeAreaProvider>
        </PaperProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );

  const view = await render(ui, { wrapper: Wrapper });

  // Run out the timers the first paint started, inside `act`, so that the
  // state they set counts as part of the render and not as a stray update
  // after it. The test then reads a tree that has stopped changing.
  await act(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, PAPER_PLACEHOLDER_DELAY_MS + SETTLE_MARGIN_MS)
    );
  });

  return view;
}
