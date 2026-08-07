import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import {
  MODE_ORDER,
  useActivePreset,
  useStationStore,
} from '../../store/useStationStore';
import { spacing } from '../../theme';
import ChipGroup from './ChipGroup';
import Note from './Note';
import SectionHeading from './SectionHeading';

/**
 * The mode, and what it costs.
 *
 * Modes are listed hardest first, so the list itself reads as the ranking
 * it is: choosing FT8 over SSB is worth about 25 dB, which is the
 * difference between a closed path and a workable one.
 */
export default function ModeSection(
  { requiredSnrDb }: { requiredSnrDb?: number | undefined; },
) {
  const { t } = useTranslation();
  const { mode } = useActivePreset();
  const setMode = useStationStore((s) => s.setMode);

  return (
    <>
      <SectionHeading text={t('station.modeSection')} />
      <Note style={styles.hint}>{t('station.modeHint')}</Note>
      <ChipGroup
        options={MODE_ORDER}
        selected={mode}
        onSelect={setMode}
        label={(value) => t(`station.mode.${value}`)}
        a11yLabel={(value) =>
          t('station.a11y.pickMode', { mode: t(`station.mode.${value}`) })}
      />
      {requiredSnrDb === undefined ? null : (
        <Note>
          {t('station.modeNeeds', {
            mode: t(`station.mode.${mode}`),
            db: requiredSnrDb,
          })}
        </Note>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // The hint introduces the chips rather than answering them, so its gap
  // is below it.
  hint: { marginTop: 0, marginBottom: spacing.sm },
});
