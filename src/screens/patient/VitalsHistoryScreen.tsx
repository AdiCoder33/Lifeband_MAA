import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth } from '../../services/firebase';
import { subscribeToVitalsHistory } from '../../services/vitalsService';
import { VitalsSample } from '../../types/vitals';
import { format } from 'date-fns';
import { VictoryAxis, VictoryChart, VictoryLegend, VictoryLine, VictoryScatter } from 'victory-native';

type GroupedItem = {
  date: string;
  entries: VitalsSample[];
};

const toDate = (timestamp: number) => {
  const asMs = timestamp > 2_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(asMs);
};

const groupByDate = (samples: VitalsSample[]): GroupedItem[] => {
  const map: Record<string, VitalsSample[]> = {};
  samples.forEach((s) => {
    const d = toDate(s.timestamp);
    const key = format(d, 'yyyy-MM-dd');
    map[key] = map[key] || [];
    map[key].push(s);
  });
  return Object.keys(map)
    .sort((a, b) => (a > b ? -1 : 1))
    .map((date) => ({ date, entries: map[date] }));
};

const VitalsHistoryScreen: React.FC = () => {
  const [samples, setSamples] = useState<VitalsSample[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = subscribeToVitalsHistory(uid, setSamples);
    return () => unsub();
  }, []);

  const sortedSamples = useMemo(() => {
    return [...samples].sort((a, b) => a.timestamp - b.timestamp);
  }, [samples]);

  const recentSamples = useMemo(() => {
    return sortedSamples.slice(-20);
  }, [sortedSamples]);

  const hrTrend = useMemo(() => recentSamples.map((s) => ({ x: toDate(s.timestamp), y: s.hr })), [recentSamples]);

  const spo2Trend = useMemo(
    () => recentSamples.filter((s) => typeof s.spo2 === 'number').map((s) => ({ x: toDate(s.timestamp), y: s.spo2! })),
    [recentSamples],
  );

  const bpTrends = useMemo(() => {
    const sys = recentSamples.map((s) => ({ x: toDate(s.timestamp), y: s.bp_sys }));
    const dia = recentSamples.map((s) => ({ x: toDate(s.timestamp), y: s.bp_dia }));
    return { sys, dia };
  }, [recentSamples]);

  const grouped = useMemo(() => groupByDate(samples), [samples]);

  const trendHeader = useMemo(() => {
    return (
      <View style={styles.chartCard}>
        <Text style={styles.title}>Vitals History</Text>
        <Text style={styles.chartSubtitle}>
          {recentSamples.length ? `Visualising the last ${recentSamples.length} readings` : 'Connect your LifeBand to begin tracking.'}
        </Text>
        <View style={styles.chartBlock}>
          <Text style={styles.chartBlockTitle}>Heart Rate</Text>
          {hrTrend.length >= 2 ? (
            <VictoryChart
              scale={{ x: 'time' }}
              height={220}
              padding={{ top: 24, bottom: 48, left: 48, right: 32 }}
            >
              <VictoryAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'transparent' },
                }}
                tickFormat={(tick) => format(new Date(tick), 'MMM d')}
              />
              <VictoryAxis
                dependentAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'rgba(40, 53, 147, 0.08)' },
                }}
              />
              <VictoryLine
                interpolation="monotoneX"
                data={hrTrend}
                style={{ data: { stroke: colors.secondary, strokeWidth: 3 } }}
              />
              <VictoryScatter data={hrTrend} size={4} style={{ data: { fill: colors.secondary } }} />
            </VictoryChart>
          ) : (
            <Text style={styles.chartEmpty}>Need at least two readings to draw this trend.</Text>
          )}
        </View>
        <View style={styles.chartBlock}>
          <Text style={styles.chartBlockTitle}>SpO₂</Text>
          {spo2Trend.length >= 2 ? (
            <VictoryChart
              scale={{ x: 'time' }}
              height={200}
              padding={{ top: 24, bottom: 48, left: 48, right: 32 }}
              domain={{ y: [92, 100] }}
            >
              <VictoryAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'transparent' },
                }}
                tickFormat={(tick) => format(new Date(tick), 'MMM d')}
              />
              <VictoryAxis
                dependentAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'rgba(77, 182, 172, 0.2)' },
                }}
              />
              <VictoryLine
                interpolation="monotoneX"
                data={spo2Trend}
                style={{ data: { stroke: colors.accent, strokeWidth: 3 } }}
              />
              <VictoryScatter data={spo2Trend} size={4} style={{ data: { fill: colors.accent } }} />
            </VictoryChart>
          ) : (
            <Text style={styles.chartEmpty}>SpO₂ readings will appear here once available.</Text>
          )}
        </View>
        <View style={styles.chartBlock}>
          <Text style={styles.chartBlockTitle}>Blood Pressure</Text>
          {bpTrends.sys.length >= 2 ? (
            <VictoryChart
              scale={{ x: 'time' }}
              height={220}
              padding={{ top: 24, bottom: 48, left: 48, right: 32 }}
            >
              <VictoryAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'transparent' },
                }}
                tickFormat={(tick) => format(new Date(tick), 'MMM d')}
              />
              <VictoryAxis
                dependentAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'rgba(40, 53, 147, 0.08)' },
                }}
              />
              <VictoryLegend
                x={48}
                y={8}
                orientation="horizontal"
                gutter={16}
                data={[
                  { name: 'Systolic', symbol: { fill: colors.secondary } },
                  { name: 'Diastolic', symbol: { fill: colors.accent } },
                ]}
                style={{ labels: { fill: colors.textSecondary, fontSize: 12 } }}
              />
              <VictoryLine
                interpolation="monotoneX"
                data={bpTrends.sys}
                style={{ data: { stroke: colors.secondary, strokeWidth: 3 } }}
              />
              <VictoryScatter data={bpTrends.sys} size={4} style={{ data: { fill: colors.secondary } }} />
              <VictoryLine
                interpolation="monotoneX"
                data={bpTrends.dia}
                style={{ data: { stroke: colors.accent, strokeWidth: 3 } }}
              />
              <VictoryScatter data={bpTrends.dia} size={4} style={{ data: { fill: colors.accent } }} />
            </VictoryChart>
          ) : (
            <Text style={styles.chartEmpty}>Blood pressure trends will populate as readings stream in.</Text>
          )}
        </View>
      </View>
    );
  }, [recentSamples.length, hrTrend, spo2Trend, bpTrends]);

  return (
    <ScreenContainer>
      <FlatList
        data={grouped}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={trendHeader}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{format(new Date(item.date), 'MMMM d, yyyy')}</Text>
            {item.entries.map((s, idx) => {
              const ts = toDate(s.timestamp);
              return (
                <View key={`${item.date}-${idx}`} style={styles.row}>
                  <View>
                    <Text style={styles.time}>{format(ts, 'HH:mm')}</Text>
                    <Text style={styles.meta}>HR {s.hr} bpm</Text>
                  </View>
                  <View style={styles.metrics}>
                    <Text style={styles.meta}>BP {s.bp_sys}/{s.bp_dia}</Text>
                    <Text style={styles.meta}>HRV {s.hrv} ms</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No vitals yet. Connect your LifeBand to start tracking.</Text>}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  chartCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  chartSubtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chartBlock: {
    marginBottom: spacing.lg,
  },
  chartBlockTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  chartEmpty: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  section: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  sectionTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#E0E0E0',
  },
  time: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  metrics: {
    alignItems: 'flex-end',
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    padding: spacing.lg,
  },
});

export default VitalsHistoryScreen;
