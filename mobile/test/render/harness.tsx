import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { PaperProvider, Portal } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '../../src/i18n/index';
import { lightTheme } from '../../src/theme';

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
 *
 * Icons draw nothing. The font is loaded by the app at boot and there is
 * no boot here, so every icon in the tree would otherwise print a warning
 * about a missing icon library. Nothing is asserted against an icon: they
 * carry no text, so a label is what a screen reader announces and a label
 * is what these tests look for.
 */
export function renderWithApp(ui: ReactElement) {
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

  return render(ui, { wrapper: Wrapper });
}
