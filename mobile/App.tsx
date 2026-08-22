import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { Dimensions, StyleSheet, useColorScheme, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as Engine from './modules/engine-bridge';
import { wireFocus } from './src/api/focus';
import {
  CACHE_BUSTER,
  persister,
  queryClient,
  shouldPersistQuery,
} from './src/api/persist';
import BootFrame from './src/components/BootFrame';
import ErrorBoundary from './src/components/ErrorBoundary';
import { isTablet } from './src/data/rotation';
import i18n from './src/i18n';
import ForecastScreen from './src/screens/ForecastScreen';
import { useSettingsStore } from './src/store/useSettingsStore';
import { darkTheme, lightTheme, lowLightTheme } from './src/theme';

export default function App() {
  const scheme = useColorScheme();
  const mode = useSettingsStore((s) => s.themeMode);
  const mapsOnCard = useSettingsStore((s) => s.mapsOnCard);
  const language = useSettingsStore((s) => s.language);

  // i18next starts on the device's language, because the stored one is
  // read back after the first render. Null means nobody has picked, so
  // the device keeps the say.
  React.useEffect(() => {
    if (language !== null && language !== i18n.language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  // Stale readings refetch once when the app comes back to the front.
  // See `api/focus.ts` for why React Query cannot see that by itself.
  React.useEffect(() => wireFocus(), []);

  // A tablet may be turned on its side; a telephone stays upright.
  //
  // Only ever unlocks. The manifest holds the app portrait, which is the
  // answer for a telephone and needs no code, so nothing here can leave a
  // small screen free by accident. `Dimensions` rather than a hook,
  // because this asks about the hardware and must not run again when the
  // device turns.
  //
  // Nothing awaits it and a failure is swallowed: on a device that
  // refuses, the app stays portrait, which is where it started.
  React.useEffect(() => {
    const { width, height } = Dimensions.get('screen');
    if (!isTablet(width, height)) return;
    void ScreenOrientation.unlockAsync().catch(() => {});
  }, []);

  // Where stored maps are kept. Told to the module here rather than
  // where the choice is made, because the module forgets it when the app
  // stops and the choice outlives the app — a person who put their maps
  // on the card last month must still find them there today.
  React.useEffect(() => {
    if (Engine.canStoreMaps()) Engine.setMapCardUse(mapsOnCard);
  }, [mapsOnCard]);
  // `system` follows the device; the others override it. Read here so one
  // value drives the theme, the status bar and every component below.
  //
  // `lowLight` is never reached from `system`: nothing the device reports
  // says a reader wants red on black, so it is a choice and only a
  // choice.
  const lowLight = mode === 'lowLight';
  const dark = lowLight
    || (mode === 'system' ? scheme === 'dark' : mode === 'dark');
  const theme = lowLight ? lowLightTheme : dark ? darkTheme : lightTheme;

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
  //
  // While they are loading, the frame holds the screen's own skeletons
  // rather than sitting empty — see `BootFrame` for why the shape does
  // not have to wait for the type. The whole provider tree mounts
  // either way, so the screen arrives by swapping one child, not by
  // rebuilding the world around it.
  const booted = fontsLoaded || fontError;

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
            <View style={styles.root}>
              <ErrorBoundary
                labels={{
                  title: i18n.t('crash.title'),
                  body: i18n.t('crash.body'),
                  retry: i18n.t('status.retry'),
                }}
              >
                {booted ? <ForecastScreen /> : <BootFrame />}
              </ErrorBoundary>
            </View>
          </SafeAreaProvider>
        </PaperProvider>
      </I18nextProvider>
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
