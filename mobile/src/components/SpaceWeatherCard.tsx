import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import type { Sounding, SpaceWeather } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { face, numeric, radius, spacing, track, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** Null when the upstream was unreachable. */
  spaceWeather: SpaceWeather | null;
  /**
   * A measured foF2 from a nearby sounder, when one is close enough and
   * reporting. Undefined while loading, null when there is none — and null
   * is the ordinary case, since live stations are almost all in Europe.
   */
  sounding?: Sounding | null | undefined;
  /** The readings came from the cache, so they are no longer current. */
  offline?: boolean;
}

interface TileProps {
  label: string;
  value: string;
  hint: string;
  /**
   * Marks the one solar-driven number. Amber appears exactly once in the
   * app, which is what makes it read as meaning rather than decoration.
   */
  solar?: boolean;
}

function Tile({ label, value, hint, solar }: TileProps) {
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}. ${hint}`}
      style={[styles.tile, { backgroundColor: ui.inset }]}
    >
      <Text style={[typography.label, { color: ui.text4 }]}>{label}</Text>
      <Text
        style={[typography.statValue, numeric, {
          color: solar ? ui.amberNum : ui.ink,
        }]}
      >
        {value}
      </Text>
      <Text style={[styles.hint, { color: ui.text3 }]}>{hint}</Text>
    </View>
  );
}

/**
 * Current solar and geomagnetic conditions.
 *
 * These are the inputs behind a now-cast, not a measurement of the path. Each
 * figure carries a plain-language line, so it is readable by somebody who has
 * never met a K index.
 *
 * Offline, the hints change rather than the numbers. The K index matters most:
 * a cached quiet reading is the most dangerous number in the app, because a
 * storm that started since then looks exactly like calm conditions. So it says
 * that outright instead of implying it with a timestamp.
 */
export default function SpaceWeatherCard({
  spaceWeather,
  sounding,
  offline = false,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  if (!spaceWeather) {
    return (
      <View style={styles.unavailable}>
        <Icon source="cloud-off-outline" size={18} color={ui.text3} />
        <Text style={[typography.caption, styles.text, { color: ui.text3 }]}>
          {t('spaceWeather.unavailable')}
        </Text>
      </View>
    );
  }

  // Kp runs 0-9. Anything at or above 5 is a geomagnetic storm.
  const stormy = spaceWeather.kp >= 5;

  return (
    <View style={styles.wrap}>
      <View style={styles.tiles}>
        <Tile
          label={t('spaceWeather.flux')}
          value={f.integer(spaceWeather.f107)}
          hint={offline
            ? t('spaceWeather.fluxSaved')
            : t('spaceWeather.fluxHint')}
          solar
        />
        <Tile
          label={t('spaceWeather.kp')}
          value={f.decimal(spaceWeather.kp)}
          hint={offline
            ? t('spaceWeather.kpSaved')
            : stormy
            ? t('spaceWeather.kpStormy')
            : t('spaceWeather.kpQuiet')}
        />
        <Tile
          label={t('spaceWeather.effectiveSsn')}
          value={f.integer(spaceWeather.effectiveSsn)}
          hint={t('spaceWeather.effectiveSsnHint')}
        />
      </View>
      {
        /* The one measured number in the app. Everything above is an index
           that feeds the model; this is an ionosonde saying what the
           ionosphere actually did, which is the only line here a user can
           check the model against. Absent for most of the world. */
      }
      {sounding && (
        <View
          accessible
          accessibilityLabel={t('a11y.sounding', {
            value: f.megahertz(sounding.fof2),
            station: sounding.station,
            distance: f.distance(sounding.km),
            time: f.hourMinute(new Date(sounding.measuredAt)),
          })}
          style={[styles.sounding, {
            backgroundColor: offline ? ui.inset : ui.ionoBg,
            borderColor: offline ? ui.line2 : ui.ionoBg,
            borderStyle: offline ? 'dashed' : 'solid',
          }]}
        >
          <View
            style={[styles.tag, {
              backgroundColor: offline ? ui.inset : ui.tagBg,
            }]}
          >
            <Text
              style={[styles.tagText, {
                color: offline ? ui.text3 : ui.tagFg,
              }]}
            >
              {offline
                ? t('spaceWeather.lastMeasured')
                : t('spaceWeather.measuredTag')}
            </Text>
          </View>
          <View style={styles.soundingText}>
            <Text
              style={[typography.bodyStrong, numeric, {
                color: offline ? ui.text2 : ui.ionoTitle,
              }]}
            >
              {t('spaceWeather.measuredTitle', {
                value: f.megahertz(sounding.fof2),
              })}
            </Text>
            <Text
              style={[styles.hint, {
                color: offline ? ui.text3 : ui.ionoSub,
              }]}
            >
              {t('spaceWeather.measuredSub', {
                station: sounding.station,
                distance: f.distance(sounding.km),
                time: f.hourMinute(new Date(sounding.measuredAt)),
              })}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  // Wraps rather than scrolls: three tiles fit a phone at two per row and a
  // tablet at three, and a horizontal scroller would hide one of them.
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 132,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.inset,
  },
  sounding: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
  soundingText: { flex: 1, gap: 2 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    lineHeight: 14,
    ...face.bold,
    letterSpacing: track(0.6),
    textTransform: 'uppercase',
  },
  unavailable: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  text: { flex: 1 },
  hint: { fontSize: 12, lineHeight: 16 },
});
