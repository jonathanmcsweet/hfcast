import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  Divider,
  Icon,
  Menu,
  Text,
  Tooltip,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { isBidirectional, lobes } from '../data/orientation';
import { useUnits } from '../hooks/useUnits';
import {
  activePreset,
  type AntennaKey,
  type ModeKey,
  usesBeam,
  useStationStore,
} from '../store/useStationStore';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * Which station this is, and what it is, beside the band selector.
 *
 * It sits here because the band and the station answer the same question
 * together: this band, at this power, on this antenna, for this mode.
 * Reading a grid of reliabilities without knowing which of those was
 * assumed is what the app did before, and it was wrong often enough to
 * matter.
 *
 * The name on the left opens a list of the saved stations, so switching
 * between a base and a portable is one tap and does not go through the
 * settings at all. The three items after it open the settings, and each
 * carries a tooltip — long press on a touch screen, hover with a
 * pointer — saying what it is. The text beside every icon carries the
 * same information, so nothing depends on recognising a symbol or on
 * being able to long press.
 */

const MODE_ICONS: Record<ModeKey, string> = {
  fm: 'sine-wave',
  am: 'sine-wave',
  ssb: 'microphone',
  rtty: 'typewriter',
  cw: 'dots-horizontal',
  psk31: 'waveform',
  ft8: 'laptop',
  js8: 'laptop',
  wspr: 'radio-tower',
};

const ANTENNA_ICONS: Record<AntennaKey, string> = {
  isotropic: 'circle-outline',
  dipole: 'minus',
  // A shallow peak, which is the shape of the wire. The badge carries the
  // antenna's name beside it, so the icon only has to be distinct from
  // the dipole's flat line rather than carry the meaning alone.
  invertedV: 'chevron-up',
  vertical: 'arrow-up',
  invertedL: 'ray-start-arrow',
  yagi: 'antenna',
};

interface Props {
  onPress: () => void;
  /** The threshold the forecast on screen was computed at, from the server. */
  requiredSnrDb: number;
}

export default function StationStrip({ onPress, requiredSnrDb }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const units = useUnits();
  const ui = theme.colors.ui;
  const [listOpen, setListOpen] = useState(false);

  const presets = useStationStore((s) => s.presets);
  const activeId = useStationStore((s) => s.activeId);
  const selectPreset = useStationStore((s) => s.selectPreset);

  const preset = activePreset({ presets, activeId });
  const { watts, mode, antenna } = preset;
  // Which way it actually favours, which is not the number stored for a
  // wire: a dipole radiates at right angles to its run, both ways.
  const facing = lobes(antenna.beamDeg, antenna.type).map(Math.round);
  const nameOf = (name: string) => name === '' ? t('station.unnamed') : name;

  const item = (
    key: string,
    icon: string,
    label: string,
    tooltip: string,
    spoken: string,
  ) => (
    <Tooltip title={tooltip} key={key}>
      <TouchableRipple
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={t('station.a11y.openHint')}
        style={styles.item}
      >
        <View style={styles.itemRow}>
          <Icon source={icon} size={14} color={ui.text3} />
          <Text style={[typography.axis, numeric, { color: ui.text3 }]}>
            {label}
          </Text>
        </View>
      </TouchableRipple>
    </Tooltip>
  );

  return (
    <View style={styles.row}>
      {
        /* The name is a menu rather than a fourth shortcut into the
           settings: switching stations is the frequent action, and going
           through a modal to do it would cost four taps instead of two. */
      }
      <Menu
        visible={listOpen}
        onDismiss={() => setListOpen(false)}
        anchor={
          <Tooltip title={t('station.tip.preset')}>
            <TouchableRipple
              onPress={() => setListOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('station.a11y.preset', {
                name: nameOf(preset.name),
              })}
              accessibilityHint={t('station.a11y.presetHint')}
              style={[styles.item, styles.preset, { borderColor: ui.line }]}
            >
              <View style={styles.itemRow}>
                <Icon source="radio" size={14} color={ui.text2} />
                {
                  /* Truncated, unlike the three items beside it. Those carry
                     fixed vocabulary — CW, 100 W, Dipole — and a name is
                     whatever somebody typed, so it is the only one here that
                     can push the rest onto a second line. */
                }
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[typography.axis, styles.presetName, {
                    color: ui.text2,
                  }]}
                >
                  {nameOf(preset.name)}
                </Text>
                <Icon source="menu-down" size={14} color={ui.text3} />
              </View>
            </TouchableRipple>
          </Tooltip>
        }
      >
        {presets.map((option) => (
          <Menu.Item
            key={option.id}
            title={nameOf(option.name)}
            leadingIcon={option.id === activeId ? 'check' : 'radio'}
            onPress={() => {
              setListOpen(false);
              selectPreset(option.id);
            }}
          />
        ))}
        <Divider />
        <Menu.Item
          title={t('station.manage')}
          leadingIcon="cog-outline"
          onPress={() => {
            setListOpen(false);
            onPress();
          }}
        />
      </Menu>

      {item(
        'mode',
        MODE_ICONS[mode],
        t(`station.mode.${mode}`),
        t('station.tip.mode', {
          mode: t(`station.mode.${mode}`),
          db: requiredSnrDb,
        }),
        t('station.a11y.mode', {
          mode: t(`station.mode.${mode}`),
          db: requiredSnrDb,
        }),
      )}
      {item(
        'power',
        'flash',
        t('station.watts', { watts }),
        t('station.tip.power', { watts }),
        t('station.a11y.powerIs', { watts }),
      )}
      {item(
        'antenna',
        ANTENNA_ICONS[antenna.type],
        t(`station.antenna.${antenna.type}`),
        antenna.type === 'isotropic'
          ? t('station.tip.isotropic')
          : t('station.tip.antenna', {
            antenna: t(`station.antenna.${antenna.type}`),
            height: units.height(antenna.heightM),
          }),
        antenna.type === 'isotropic'
          ? t('station.a11y.isotropic')
          : t('station.a11y.antennaIs', {
            antenna: t(`station.antenna.${antenna.type}`),
            height: units.height(antenna.heightM),
          }),
      )}

      {
        /* Which way it faces, only where that means something. A vertical
           has no direction — measured at 0 dB over the whole compass — so
           a badge reading "0°" for one would be a number the model never
           reads, shown as though it mattered. Two lobes are both listed,
           because a dipole favouring 122 and 302 equally is the thing
           newcomers are most often surprised by. */
      }
      {usesBeam(antenna.type)
        ? item(
          'facing',
          isBidirectional(antenna.type) ? 'arrow-left-right' : 'navigation',
          isBidirectional(antenna.type)
            ? t('station.twoLobes', { first: facing[0], second: facing[1] })
            : t('station.degrees', { degrees: facing[0] }),
          t(
            isBidirectional(antenna.type)
              ? 'station.tip.wire'
              : 'station.tip.beam',
            {
              antenna: t(`station.antenna.${antenna.type}`),
              first: facing[0],
              second: facing[1] ?? facing[0],
            },
          ),
          t(
            isBidirectional(antenna.type)
              ? 'station.a11y.facingTwo'
              : 'station.a11y.facingOne',
            { first: facing[0], second: facing[1] ?? facing[0] },
          ),
        )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than scrolls: a name and three short items fit a phone in
  // English, and German runs about a third longer. A second line is
  // better than a hidden one.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // 32 by however wide the label runs, which clears WCAG 2.5.8's 24 by 24
  // minimum. Not the 44 pt a primary control gets: these are shortcuts to
  // a setting that has full-size controls of its own in the modal, and
  // four 44 pt buttons beside a heading would outweigh the heading.
  item: {
    minHeight: 32,
    minWidth: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.cell,
  },
  // The name is outlined because it does something different from the
  // three beside it: it opens a list rather than the settings.
  preset: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    // Wide enough for about a dozen characters, which covers "Base station"
    // and most callsigns. Past that the name truncates rather than growing
    // until the mode, power and antenna wrap onto a line of their own.
    maxWidth: 160,
  },
  // Shrinks inside that width; the two icons either side of it do not.
  presetName: { flexShrink: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
