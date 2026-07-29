import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';

import {
  DEFAULT_ADDRESS,
  normaliseAddress,
  useServerStore,
} from '../store/useServerStore';
import { spacing, typography } from '../theme';

/**
 * Where to find the prediction server.
 *
 * This exists because an installed build cannot be rebuilt. The address was
 * fixed when the APK was made, at this device, so a phone reached nothing and
 * had no way to say where to look instead.
 *
 * Reachable from the error screen as well as from the settings menu, since the
 * error screen is the whole app when there is no forecast — a setting only
 * available behind a working forecast would be unreachable exactly when it is
 * needed.
 */

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Nothing has to be told when this changes. Every query key carries the
 * server, so saving a new address makes React Query fetch under the new key
 * by itself — and a cached answer from the old server is never shown as if it
 * came from the new one.
 */
export default function ServerAddressDialog({ visible, onDismiss }: Props) {
  const { t } = useTranslation();
  const address = useServerStore((s) => s.address);
  const setAddress = useServerStore((s) => s.setAddress);

  const [typed, setTyped] = useState(address);
  const [rejected, setRejected] = useState(false);

  // Opening the dialog shows what is stored, not what was half-typed and
  // abandoned last time.
  useEffect(() => {
    if (visible) {
      setTyped(address);
      setRejected(false);
    }
  }, [visible, address]);

  const save = () => {
    if (!setAddress(typed)) {
      setRejected(true);
      return;
    }
    onDismiss();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{t('server.title')}</Dialog.Title>
        <Dialog.Content>
          <Text style={typography.body}>{t('server.explain')}</Text>
          <TextInput
            mode="outlined"
            dense
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            value={typed}
            onChangeText={(text) => {
              setTyped(text);
              setRejected(false);
            }}
            placeholder={DEFAULT_ADDRESS}
            accessibilityLabel={t('server.field')}
            style={styles.field}
          />
          {
            /* The cleaned-up form is shown before saving, because the field is
               forgiving: a bare host and port is accepted and becomes a URL,
               and seeing that happen is better than wondering whether it did. */
          }
          <Text style={[typography.caption, styles.hint]}>
            {rejected
              ? t('server.invalid')
              : t('server.willUse', {
                address: normaliseAddress(typed) ?? DEFAULT_ADDRESS,
              })}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={() => {
              setTyped(DEFAULT_ADDRESS);
              setRejected(false);
            }}
          >
            {t('server.default')}
          </Button>
          <Button onPress={onDismiss}>{t('server.cancel')}</Button>
          <Button mode="contained" onPress={save}>{t('server.save')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.sm },
  hint: { marginTop: spacing.xs },
});
