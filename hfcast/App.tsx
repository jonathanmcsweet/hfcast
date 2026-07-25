import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from './src/i18n';
import ForecastScreen from './src/screens/ForecastScreen';
import { darkTheme, lightTheme } from './src/theme';

/**
 * One client for the app. Predictions are climatology, so the defaults lean
 * away from refetching; each query sets the staleTime that suits its data.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <PaperProvider theme={theme}>
          <SafeAreaProvider>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <ForecastScreen />
          </SafeAreaProvider>
        </PaperProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
