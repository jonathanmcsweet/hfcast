import React, { useState } from 'react';
import { Appbar, Menu } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, SUPPORTED } from '../i18n';
import type { SupportedLanguage } from '../i18n';
import { useDirection } from '../hooks/useDirection';

export default function LocalePicker() {
  const [open, setOpen] = useState(false);
  const { i18n, t } = useTranslation();
  const { setLanguage } = useDirection();

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Appbar.Action
          icon="translate"
          accessibilityLabel={t('settings.changeLanguage')}
          onPress={() => setOpen(true)}
        />
      }
    >
      {SUPPORTED.map((lang) => (
        <Menu.Item
          key={lang}
          title={LANGUAGE_NAMES[lang]}
          leadingIcon={i18n.language === lang ? 'check' : undefined}
          onPress={() => {
            setOpen(false);
            void setLanguage(lang as SupportedLanguage);
          }}
        />
      ))}
    </Menu>
  );
}
