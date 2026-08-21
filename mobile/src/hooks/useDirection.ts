import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager } from 'react-native';
import * as AppRestart from '../../modules/app-restart';
import { RTL_LANGUAGES } from '../i18n';
import type { SupportedLanguage } from '../i18n';
import { SETTINGS_KEY, useSettingsStore } from '../store/useSettingsStore';

/**
 * React Native decides layout direction natively, so `I18nManager.forceRTL`
 * only takes effect after the app starts again. This is the single biggest
 * gotcha in RTL support: without the restart, strings flip but layout does not.
 */
export function useDirection() {
  const { i18n } = useTranslation();
  const remember = useSettingsStore((s) => s.setLanguage);

  const setLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      const shouldBeRTL = RTL_LANGUAGES.includes(lang);
      remember(lang);
      await i18n.changeLanguage(lang);

      if (shouldBeRTL !== I18nManager.isRTL) {
        I18nManager.allowRTL(shouldBeRTL);
        I18nManager.forceRTL(shouldBeRTL);

        // The store writes through AsyncStorage without returning a promise
        // to wait on, and the restart below ends the process. AsyncStorage
        // runs its native calls in the order they arrive, so a read that
        // resolves means the write ahead of it has landed.
        await AsyncStorage.getItem(SETTINGS_KEY);

        try {
          AppRestart.restart();
        } catch {
          // No native module in Expo Go, and none on iOS yet.
          Alert.alert(
            i18n.t('settings.changeLanguage'),
            'Restart the app to apply the new layout direction.',
          );
        }
      }
    },
    [i18n, remember],
  );

  return { isRTL: I18nManager.isRTL, setLanguage };
}
