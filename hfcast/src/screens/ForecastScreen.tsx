import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import PathHeader from '../components/PathHeader';
import HeroCard from '../components/HeroCard';
import HourlyStrip from '../components/HourlyStrip';
import BandList from '../components/BandList';
import BandHeatmap from '../components/BandHeatmap';
import QualityLegend from '../components/QualityLegend';
import DisclaimerCard from '../components/DisclaimerCard';
import SectionHeading from '../components/SectionHeading';

import { samplePrediction } from '../data/samplePrediction';
import type { AppTheme } from '../theme';

export default function ForecastScreen() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const prediction = samplePrediction;
  const hour = now.getUTCHours();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <PathHeader prediction={prediction} now={now} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <HeroCard prediction={prediction} hour={hour} />

        <SectionHeading title={t('sections.hourly')} />
        <HourlyStrip prediction={prediction} hour={hour} />

        <SectionHeading title={t('sections.bands')} />
        <BandList prediction={prediction} hour={hour} />

        <SectionHeading
          title={t('sections.outlook')}
          hint={t('sections.outlookHint')}
        />
        <BandHeatmap prediction={prediction} />
        <View style={styles.legend}>
          <QualityLegend />
        </View>

        <DisclaimerCard smoothedSSN={prediction.smoothedSSN} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  legend: { marginHorizontal: 16 },
});
