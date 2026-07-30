import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  CACHE_BUSTER,
  persister,
  queryClient,
  shouldPersistQuery,
} from './src/api/persist';
import ErrorBoundary from './src/components/ErrorBoundary';
import i18n from './src/i18n';
import ForecastScreen from './src/screens/ForecastScreen';
import { useSettingsStore } from './src/store/useSettingsStore';
import { darkTheme, lightTheme } from './src/theme';

export default function App() {
  const scheme = useColorScheme();
  const mode = useSettingsStore((s) => s.themeMode);
  // `system` follows the device; the other two override it. Read here so
  // one value drives the theme, the status bar and every component below.
  const dark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  const theme = dark ? darkTheme : lightTheme;

  // One family, four weights. The type scale picks a weight by naming the
  // face, so all four have to be present before anything renders — with a
  // face missing, every style that asked for it falls back to the system
  // font at a different width and the whole layout shifts.
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    // Every icon in the app is a glyph in this one file, which
    // `react-native-paper` reaches through `react-native-vector-icons`. Loading
    // it here rather than leaving it to the build: Expo used to bundle these
    // fonts as a side effect of shipping `@expo/vector-icons`, and SDK 57 does
    // not, so the icons became empty boxes with no error anywhere. Asking for
    // the file by name is the part that cannot silently stop happening.
    //
    // The key has to be the file's own basename. On Android
    // `react-native-vector-icons` ignores the family name it was given and
    // looks for the font by filename.
    MaterialCommunityIcons: require(
      'react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf',
    ),
  });

  // A font that failed to load is not a reason to show nothing: the system
  // font is worse-looking, not unreadable, and an operator in the field
  // needs the forecast more than the typeface.
  if (!fontsLoaded && !fontError) return null;

  return (
    // The children render before the cache has been read back, which is
    // correct: a first launch has nothing to restore, and a screen that
    // waited would flash empty on every start. `ForecastScreen` shows its
    // pending state until either the cache or the network answers.
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: CACHE_BUSTER,
        // `maxAge` discards the whole stored cache at once, not entry by
        // entry, so any finite value means "open the app rarely enough
        // and you get nothing". That is the opposite of what a field
        // user needs. Age is handled instead by the query key, which
        // carries an absolute date: an entry is only ever reused on the
        // day it describes, and `OFFLINE_GC_TIME` clears the rest.
        maxAge: Number.POSITIVE_INFINITY,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success'
            && shouldPersistQuery(query.queryKey),
        },
      }}
    >
      <I18nextProvider i18n={i18n}>
        <PaperProvider theme={theme}>
          <SafeAreaProvider>
            <StatusBar style={dark ? 'light' : 'dark'} />
            {
              /* Translated through the instance rather than a hook: the
                 boundary has to be able to render when what it wraps
                 has failed. */
            }
            <ErrorBoundary
              labels={{
                title: i18n.t('crash.title'),
                body: i18n.t('crash.body'),
                retry: i18n.t('status.retry'),
              }}
            >
              <ForecastScreen />
            </ErrorBoundary>
          </SafeAreaProvider>
        </PaperProvider>
      </I18nextProvider>
    </PersistQueryClientProvider>
  );
}
