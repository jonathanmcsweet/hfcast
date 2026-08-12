import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Divider,
  List,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGeocode } from '../api/queries';
import { type Endpoint, type Place, placeToEndpoint } from '../data/types';
import { useDeviceFix } from '../hooks/useDeviceFix';
import { GREENWICH } from '../store/usePathStore';
import { face, radius, spacing, track, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** Called with the location to work from, whether chosen or skipped. */
  onDone: (from: Endpoint) => void;
}

/**
 * The examples, which are also the documentation.
 *
 * Tapping one fills the field, so the formats are demonstrated rather than
 * described — the alternative is a paragraph nobody reads listing notations
 * most people have never had to name.
 */
const EXAMPLES = [
  'Denver',
  '39.74, -104.99',
  '39°44′N 104°59′W',
  'DM79',
] as const;

/**
 * The first thing a new install shows: where is the operator.
 *
 * It exists because the app used to open on a path between two cities nobody
 * chose, and every number on the screen was about somebody else's station.
 *
 * Skipping is a real answer rather than a way out. It sets Greenwich, which is
 * where UTC starts and so the one location that explains itself on a screen
 * where every hour is UTC, and asks nothing further. No destination is
 * requested either way — the map answers who can hear you without one, and the
 * destination is set later from the header by whoever wants one.
 */
export default function FirstRunLocation({ onDone }: Props) {
  const theme = useTheme<AppTheme>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const ui = theme.colors.ui;

  const [query, setQuery] = useState('');
  // What was picked from the list, which outranks the first match until the
  // query changes. Tapping a result used to finish the screen outright; it
  // now fills the panel above and closes the list, because a list that
  // stayed open after a choice read as a choice that had not registered
  // (user, 2026-08-12).
  const [picked, setPicked] = useState<Place | null>(null);

  const { data: results, isFetching } = useGeocode(query, i18n.language);

  // The first match is what Continue takes unless something was picked, so
  // the list below is showing the alternatives to it rather than a separate
  // set of options.
  const best = useMemo(
    () => picked ?? results?.[0] ?? null,
    [picked, results],
  );

  // A new query means the old pick is not an answer to it. One place that
  // does both, so no path can change one without the other.
  const retype = (text: string) => {
    setPicked(null);
    setQuery(text);
  };

  const {
    available: canUseDevice,
    locating,
    error: locationError,
    locate: useDeviceLocation,
  } = useDeviceFix(onDone);

  return (
    <View style={[styles.screen, { backgroundColor: ui.page }]}>
      <ScrollView
        contentContainerStyle={[styles.page, {
          paddingTop: insets.top + spacing.xl,
        }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.kicker, { color: ui.text4 }]}>
          {t('firstRun.kicker')}
        </Text>
        <Text style={[typography.screenTitle, { color: ui.ink }]}>
          {t('firstRun.title')}
        </Text>
        <Text style={[typography.body, styles.subtitle, { color: ui.text2 }]}>
          {t('firstRun.subtitle')}
        </Text>

        {
          /* Absent where it could not work rather than present and failing:
           there is no implementation on iOS or in Expo Go, and typing a
           place name does the same job. */
        }
        {canUseDevice
          ? (
            <Button
              mode="contained"
              icon="crosshairs-gps"
              onPress={useDeviceLocation}
              loading={locating}
              disabled={locating}
              style={styles.gps}
              contentStyle={styles.gpsContent}
            >
              {t('firstRun.useGps')}
            </Button>
          )
          : null}

        {locationError
          ? (
            <Text
              style={[typography.caption, styles.note, { color: ui.text3 }]}
            >
              {locationError}
            </Text>
          )
          : null}

        <View style={styles.dividerRow}>
          <Divider style={styles.dividerLine} />
          <Text style={[styles.kicker, { color: ui.text4 }]}>
            {t('firstRun.orType')}
          </Text>
          <Divider style={styles.dividerLine} />
        </View>

        <TextInput
          mode="outlined"
          value={query}
          onChangeText={retype}
          placeholder={t('location.searchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.field}
        />

        <View style={styles.chips}>
          {EXAMPLES.map((example) => (
            <TouchableRipple
              key={example}
              onPress={() => retype(example)}
              accessibilityRole="button"
              style={[styles.chip, {
                backgroundColor: ui.card,
                borderColor: ui.line,
              }]}
            >
              <Text style={[typography.caption, { color: ui.text2 }]}>
                {example}
              </Text>
            </TouchableRipple>
          ))}
        </View>

        {
          /* What was recognised, echoed back. A coordinate typed one character
           wrong resolves to somewhere real, so the check is showing the
           reader where the app thinks they are before it is used. */
        }
        <View style={[styles.panel, { backgroundColor: ui.inset }]}>
          {best
            ? (
              <>
                <Text style={[styles.kicker, { color: ui.text4 }]}>
                  {t('firstRun.recognised')}
                </Text>
                <Text style={[typography.bodyStrong, { color: ui.ink }]}>
                  {best.name}
                </Text>
                <Text style={[typography.caption, { color: ui.text3 }]}>
                  {[best.admin1, best.country, best.grid]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </>
            )
            : (
              <>
                <Text style={[typography.bodyStrong, { color: ui.text2 }]}>
                  {t('firstRun.formats')}
                </Text>
                <Text style={[typography.caption, { color: ui.text3 }]}>
                  {t('firstRun.formatsHint')}
                </Text>
              </>
            )}
          {isFetching ? <ActivityIndicator style={styles.spinner} /> : null}
        </View>

        {
          /* The rest of the matches, so a common place name can be told apart
           from the one meant. Gone once one has been picked: the panel above
           is then showing the answer, and a list still offering four others
           beside it says the tap did nothing. */
        }
        {picked !== null
          ? null
          : (results ?? []).slice(1, 5).map((place) => (
            <List.Item
              key={`${place.grid}:${place.name}:${place.lat}`}
              title={place.name}
              description={[place.admin1, place.country, place.grid]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => setPicked(place)}
            />
          ))}

        <Text style={[typography.caption, styles.note, { color: ui.text3 }]}>
          {t('firstRun.footnote')}
        </Text>
      </ScrollView>

      {
        /* Below the scroll rather than in it. These were the last thing on a
           page that grows by four rows as soon as anybody types, which put
           the only two ways forward under the fold on a phone (user,
           2026-08-12). Outside the scrolling area they cannot move. */
      }
      <View
        style={[styles.footer, {
          borderTopColor: ui.line,
          paddingBottom: insets.bottom + spacing.md,
        }]}
      >
        <Button
          mode="outlined"
          onPress={() => onDone(GREENWICH)}
          style={styles.action}
          contentStyle={styles.actionContent}
        >
          {t('firstRun.skip')}
        </Button>
        <Button
          mode="contained"
          disabled={best === null}
          onPress={() => {
            if (best !== null) onDone(placeToEndpoint(best));
          }}
          style={styles.action}
          contentStyle={styles.actionContent}
        >
          {t('firstRun.continue')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 14,
    ...face.bold,
    letterSpacing: track(0.8),
    textTransform: 'uppercase',
  },
  subtitle: { marginBottom: spacing.sm },
  gps: { borderRadius: radius.inset },
  gpsContent: { minHeight: 52 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1 },
  field: { minHeight: 52 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  panel: {
    minHeight: 56,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: 12,
    gap: 2,
  },
  spinner: { alignSelf: 'flex-start', marginTop: spacing.xs },
  note: { marginTop: spacing.xs },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: { flex: 1, borderRadius: radius.inset },
  actionContent: { minHeight: 52 },
});
