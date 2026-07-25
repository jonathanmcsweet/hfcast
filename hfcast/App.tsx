import React from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider } from 'react-i18next';

import i18n from './src/i18n';
import { darkTheme, lightTheme } from './src/theme';
import ForecastScreen from './src/screens/ForecastScreen';

export default function App() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  return (
    <I18nextProvider i18n={i18n}>
      <PaperProvider theme={theme}>
        <SafeAreaProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <ForecastScreen />
        </SafeAreaProvider>
      </PaperProvider>
    </I18nextProvider>
  );
}
