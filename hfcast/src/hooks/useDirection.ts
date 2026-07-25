import { useCallback } from 'react';
import { Alert, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import { RTL_LANGUAGES } from '../i18n';
import type { SupportedLanguage } from '../i18n';

/**
 * React Native decides layout direction natively, so `I18nManager.forceRTL`
 * only takes effect after the JS bundle reloads. This is the single biggest
 * gotcha in RTL support: without the reload, strings flip but layout does not.
 */
export function useDirection() {
  const { i18n } = useTranslation();

  const setLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      const shouldBeRTL = RTL_LANGUAGES.includes(lang);
      await i18n.changeLanguage(lang);

      if (shouldBeRTL !== I18nManager.isRTL) {
        I18nManager.allowRTL(shouldBeRTL);
        I18nManager.forceRTL(shouldBeRTL);
        try {
          await Updates.reloadAsync();
        } catch {
          // reloadAsync is unavailable in Expo Go / dev client.
          Alert.alert(
            i18n.t('settings.changeLanguage'),
            'Restart the app to apply the new layout direction.',
          );
        }
      }
    },
    [i18n],
  );

  return { isRTL: I18nManager.isRTL, setLanguage };
}
