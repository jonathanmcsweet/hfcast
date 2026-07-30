import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Divider,
  IconButton,
  List,
  Modal,
  Portal,
  Searchbar,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';

import * as DeviceLocation from '../../modules/aosp-location';
import { useGeocode } from '../api/queries';
import { latLonToGrid } from '../data/grid';
import type { Endpoint, Place } from '../data/types';
import { usePathStore } from '../store/usePathStore';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

type End = 'from' | 'to';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const placeToEndpoint = (place: Place): Endpoint => ({
  grid: place.grid,
  label: place.name,
  lat: place.lat,
  lon: place.lon,
});

/**
 * Chooses either end of the path.
 *
 * The search box takes a place name or a Maidenhead locator, so a newcomer can
 * type "Tokyo" and an operator can type "PM95". Device location only applies to
 * the near end; the far end is always searched.
 */
export default function LocationPicker({ visible, onDismiss }: Props) {
  const theme = useTheme<AppTheme>();
  const { t, i18n } = useTranslation();

  const from = usePathStore((s) => s.from);
  const to = usePathStore((s) => s.to);
  const setFrom = usePathStore((s) => s.setFrom);
  const setTo = usePathStore((s) => s.setTo);
  const swapEnds = usePathStore((s) => s.swapEnds);

  const [end, setEnd] = useState<End>('from');
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const { data: results, isFetching, error } = useGeocode(query, i18n.language);

  /**
   * Setting the near end moves to the far one instead of closing.
   *
   * Somebody who has just said where they are is very often about to say
   * where they are calling — and the pane closing on them meant reopening it
   * and finding the other tab. Choosing the far end does close, because
   * there is nothing after it.
   */
  const choose = useCallback(
    (endpoint: Endpoint) => {
      setQuery('');
      if (end === 'to') {
        setTo(endpoint);
        onDismiss();
        return;
      }
      setFrom(endpoint);
      setEnd('to');
    },
    [end, onDismiss, setFrom, setTo],
  );

  /**
   * Permission refusal is an ordinary outcome, not an error state: the search
   * box below is a complete alternative, so the message says so and the user
   * carries on.
   */
  const useDeviceLocation = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      if (!await DeviceLocation.requestPermission()) {
        setLocationError(t('location.permissionDenied'));
        return;
      }
      // Said before the wait rather than after it: with no Google services
      // there is usually no network provider, so this is satellites only and
      // a cold fix takes a while. A message that arrives 45 seconds later
      // reads as a fault rather than as an explanation.
      if (!await DeviceLocation.hasProvider()) {
        setLocationError(t('location.noProvider'));
        return;
      }
      const { latitude, longitude } = await DeviceLocation.currentFix();
      const grid = latLonToGrid(latitude, longitude);
      setFrom({ grid, label: grid, lat: latitude, lon: longitude });
      // As with choosing one by name: having just said where they are, the
      // next thing somebody usually wants is where they are calling.
      setEnd('to');
    } catch {
      setLocationError(t('location.unavailable'));
    } finally {
      setLocating(false);
    }
  }, [setFrom, t]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[typography.cardHeadline, styles.title]}>
            {t('location.title')}
          </Text>
          <IconButton
            icon="swap-horizontal"
            onPress={swapEnds}
            accessibilityLabel={t('a11y.swapEnds')}
          />
          {
            /* An explicit way out, now that choosing a location no longer
               closes the pane. Tapping the scrim still works, but that is
               not an affordance anyone can see. */
          }
          <IconButton
            icon="close"
            onPress={onDismiss}
            accessibilityLabel={t('about.close')}
          />
        </View>

        <SegmentedButtons
          value={end}
          onValueChange={(next) => setEnd(next as End)}
          buttons={[
            { value: 'from', label: `${t('location.from')}: ${from.label}` },
            {
              value: 'to',
              label: `${t('location.to')}: ${
                to?.label ?? t('location.noneSet')
              }`,
            },
          ]}
          style={styles.segments}
        />

        {
          /* Only offered once there is one to clear. The forecast without a
             destination is a whole mode rather than an empty state, so
             leaving it has to be as easy as entering it. */
        }
        {end === 'to' && to !== null
          ? (
            <Button
              mode="text"
              icon="close-circle-outline"
              onPress={() => {
                setTo(null);
                setQuery('');
                onDismiss();
              }}
              style={styles.clear}
            >
              {t('location.clearDestination')}
            </Button>
          )
          : null}

        {
          /* Absent where it could not work, rather than present and failing:
             the module is not in Expo Go, and there is no iOS implementation
             yet. Typing a place name or a grid does the same job and is the
             path most operators use anyway. */
        }
        {end === 'from' && DeviceLocation.isAvailable()
          ? (
            <Button
              mode="contained-tonal"
              icon="crosshairs-gps"
              onPress={useDeviceLocation}
              loading={locating}
              disabled={locating}
              style={styles.gps}
            >
              {t('location.useDevice')}
            </Button>
          )
          : null}

        {locationError
          ? (
            <Text
              style={[typography.caption, styles.message, {
                color: theme.colors.onSurfaceVariant,
              }]}
            >
              {locationError}
            </Text>
          )
          : null}

        <Searchbar
          value={query}
          onChangeText={setQuery}
          placeholder={t('location.searchPlaceholder')}
          // Not "characters". A locator is conventionally written in capitals
          // and this box accepts one, but forcing every letter upper case turns
          // "Wellington" into shouting for the far more common case of typing a
          // place name. Locators are matched case-insensitively instead.
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />

        {isFetching ? <ActivityIndicator style={styles.spinner} /> : null}

        {error
          ? (
            <Text
              style={[
                typography.caption,
                styles.message,
                { color: theme.colors.error },
              ]}
            >
              {t('location.searchFailed')}
            </Text>
          )
          : null}

        <FlatList
          data={results ?? []}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => `${item.grid}:${item.name}:${item.lat}`}
          ItemSeparatorComponent={Divider}
          style={styles.list}
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              description={[item.admin1, item.country, item.grid]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => choose(placeToEndpoint(item))}
            />
          )}
          ListEmptyComponent={query.trim().length >= 2 && !isFetching
            ? (
              <Text
                style={[typography.caption, styles.message, {
                  color: theme.colors.onSurfaceVariant,
                }]}
              >
                {t('location.noResults')}
              </Text>
            )
            : null}
        />
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  // Tablets get a centred dialog rather than a full-bleed sheet.
  modal: {
    margin: 20,
    maxWidth: 560,
    alignSelf: 'center',
    width: '90%',
    borderRadius: radius.card,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  segments: { marginTop: spacing.sm },
  clear: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  gps: { marginTop: spacing.md, minHeight: 52, justifyContent: 'center' },
  search: { marginTop: spacing.md },
  spinner: { marginTop: spacing.md },
  message: { marginTop: spacing.md },
  list: { marginTop: spacing.sm },
});
