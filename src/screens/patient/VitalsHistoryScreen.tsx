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

type MetricStatusTone = 'good' | 'warn' | 'critical' | 'idle';

const STATUS_COLORS: Record<MetricStatusTone, { text: string; bg: string }> = {
  good: { text: '#1B5E20', bg: 'rgba(76, 175, 80, 0.16)' },
  warn: { text: '#E65100', bg: 'rgba(251, 140, 0, 0.16)' },
  critical: { text: '#B71C1C', bg: 'rgba(229, 57, 53, 0.18)' },
  idle: { text: colors.textSecondary, bg: 'rgba(120, 144, 156, 0.16)' },
};

const DAILY_POINTS = 6;

type DailyAggregate = {
  key: string;
  date: Date;
  hrAvg?: number;
  spo2Avg?: number;
  bpSysAvg?: number;
  bpDiaAvg?: number;
};

const toDate = (timestamp: number) => {
  const asMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
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
    .map((date) => ({
      date,
      entries: map[date].sort((a, b) => ((a.timestamp ?? 0) > (b.timestamp ?? 0) ? -1 : 1)),
    }));
};

const formatMetricValue = (value?: number, unit?: string, fractionDigits = 0) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const formatted = value.toFixed(fractionDigits);
  return unit ? `${formatted} ${unit}` : formatted;
};

const formatBloodPressure = (sys?: number, dia?: number) => {
  if (typeof sys !== 'number' || typeof dia !== 'number' || Number.isNaN(sys) || Number.isNaN(dia)) {
    return '—';
  }
  return `${Math.round(sys)}/${Math.round(dia)}`;
};

const getSampleBadges = (sample: VitalsSample) => {
  const badges: { label: string; tone: MetricStatusTone }[] = [];
  if (sample.arrhythmia_alert) {
    badges.push({ label: 'Arrhythmia', tone: 'critical' });
  } else if (sample.rhythm && sample.rhythm !== 'Normal') {
    badges.push({ label: sample.rhythm, tone: 'warn' });
  }

  if (sample.anemia_alert) {
    badges.push({ label: 'Anemia risk', tone: 'critical' });
  } else if (sample.anemia_risk && sample.anemia_risk !== 'Low') {
    badges.push({ label: `${sample.anemia_risk} anemia`, tone: 'warn' });
  }

  if (sample.preeclampsia_alert) {
    badges.push({ label: 'Preeclampsia risk', tone: 'critical' });
  } else if (sample.preeclampsia_risk && sample.preeclampsia_risk !== 'Low') {
    badges.push({ label: `${sample.preeclampsia_risk} preeclampsia`, tone: 'warn' });
  }

  if (sample.buffered) {
    badges.push({ label: 'Offline sync', tone: 'idle' });
  }

  if (sample.aggregated) {
    badges.push({ label: '30-min avg', tone: 'idle' });
  }

  return badges;
};

const describeSampleWindow = (sample: VitalsSample) => {
  if (sample.aggregated) {
    const count = sample.sampleCount ?? 1;
    const durationMins = sample.bucketDurationMs ? Math.round(sample.bucketDurationMs / 60000) : 30;
    return `Avg of ${count} readings · ${durationMins} mins`;
  }
  if (sample.buffered) {
    return 'Synced from device buffer';
  }
  return 'Live capture';
};

const VitalsHistoryScreen: React.FC = () => {
  const [samples, setSamples] = useState<VitalsSample[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = subscribeToVitalsHistory(uid, setSamples, { maxEntries: 336 });
    return () => unsub();
  }, []);

  const dailyAverages = useMemo(() => {
    const buckets: Record<string, {
      date: Date;
      hrSum: number;
      hrCount: number;
      spo2Sum: number;
      spo2Count: number;
      bpSysSum: number;
      bpSysCount: number;
      bpDiaSum: number;
      bpDiaCount: number;
    }> = {};

    samples.forEach((sample) => {
      const dateObj = toDate(sample.timestamp);
      const key = format(dateObj, 'yyyy-MM-dd');
      if (!buckets[key]) {
        // Center each point at noon to avoid timezone shifts on chart
        const centered = new Date(dateObj);
        centered.setHours(12, 0, 0, 0);
        buckets[key] = {
          date: centered,
          hrSum: 0,
          hrCount: 0,
          spo2Sum: 0,
          spo2Count: 0,
          bpSysSum: 0,
          bpSysCount: 0,
          bpDiaSum: 0,
          bpDiaCount: 0,
        };
      }
      const bucket = buckets[key];
      if (typeof sample.hr === 'number' && !Number.isNaN(sample.hr)) {
        bucket.hrSum += sample.hr;
        bucket.hrCount += 1;
      }
      if (typeof sample.spo2 === 'number' && !Number.isNaN(sample.spo2)) {
        bucket.spo2Sum += sample.spo2;
        bucket.spo2Count += 1;
      }
      if (typeof sample.bp_sys === 'number' && !Number.isNaN(sample.bp_sys)) {
        bucket.bpSysSum += sample.bp_sys;
        bucket.bpSysCount += 1;
      }
      if (typeof sample.bp_dia === 'number' && !Number.isNaN(sample.bp_dia)) {
        bucket.bpDiaSum += sample.bp_dia;
        bucket.bpDiaCount += 1;
      }
    });

    return Object.entries(buckets)
      .map(([key, bucket]) => ({
        key,
        date: bucket.date,
        hrAvg: bucket.hrCount ? bucket.hrSum / bucket.hrCount : undefined,
        spo2Avg: bucket.spo2Count ? bucket.spo2Sum / bucket.spo2Count : undefined,
        bpSysAvg: bucket.bpSysCount ? bucket.bpSysSum / bucket.bpSysCount : undefined,
        bpDiaAvg: bucket.bpDiaCount ? bucket.bpDiaSum / bucket.bpDiaCount : undefined,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-DAILY_POINTS);
  }, [samples]);

  const hrTrend = useMemo(
    () => dailyAverages.filter((d) => typeof d.hrAvg === 'number').map((d) => ({ x: d.date, y: d.hrAvg! })),
    [dailyAverages],
  );

  const spo2Trend = useMemo(
    () => dailyAverages.filter((d) => typeof d.spo2Avg === 'number').map((d) => ({ x: d.date, y: d.spo2Avg! })),
    [dailyAverages],
  );

  const bpTrends = useMemo(() => ({
    sys: dailyAverages.filter((d) => typeof d.bpSysAvg === 'number').map((d) => ({ x: d.date, y: d.bpSysAvg! })),
    dia: dailyAverages.filter((d) => typeof d.bpDiaAvg === 'number').map((d) => ({ x: d.date, y: d.bpDiaAvg! })),
  }), [dailyAverages]);

  // Calculate dynamic domains for responsive charts
  const hrDomain = useMemo(() => {
    if (hrTrend.length === 0) return { min: 40, max: 200 };
    const values = hrTrend.map(d => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.15 || 10; // 15% padding or minimum 10
    return { 
      min: Math.max(40, Math.floor(min - padding)), 
      max: Math.min(200, Math.ceil(max + padding)) 
    };
  }, [hrTrend]);

  const spo2Domain = useMemo(() => {
    if (spo2Trend.length === 0) return { min: 90, max: 100 };
    const values = spo2Trend.map(d => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || 2;
    return { 
      min: Math.max(85, Math.floor(min - padding)), 
      max: Math.min(100, Math.ceil(max + padding)) 
    };
  }, [spo2Trend]);

  const bpDomain = useMemo(() => {
    if (bpTrends.sys.length === 0) return { min: 60, max: 180 };
    const sysValues = bpTrends.sys.map(d => d.y);
    const diaValues = bpTrends.dia.map(d => d.y);
    const allValues = [...sysValues, ...diaValues];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.15 || 10;
    return { 
      min: Math.max(50, Math.floor(min - padding)), 
      max: Math.min(200, Math.ceil(max + padding)) 
    };
  }, [bpTrends]);

  const grouped = useMemo(() => groupByDate(samples), [samples]);

  const trendHeader = useMemo(() => {
    return (
      <View style={styles.chartCard}>
        <Text style={styles.title}>Daily Vitals Averages</Text>
        <Text style={styles.chartSubtitle}>
          {dailyAverages.length
            ? `Showing the last ${dailyAverages.length} days`
            : 'Connect your LifeBand to begin tracking.'}
        </Text>
        <View style={styles.chartBlock}>
          <Text style={styles.chartBlockTitle}>Heart Rate</Text>
          {hrTrend.length >= 2 ? (
            <VictoryChart
              scale={{ x: 'time' }}
              height={180}
              padding={{ top: 16, bottom: 40, left: 48, right: 24 }}
              domainPadding={{ x: 25, y: 0 }}
              domain={{ y: [hrDomain.min, hrDomain.max] }}
            >
              <VictoryAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'transparent' },
                }}
                tickFormat={(tick: any) => format(new Date(tick), 'MMM d')}
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
              height={160}
              padding={{ top: 16, bottom: 40, left: 48, right: 24 }}
              domainPadding={{ x: 25, y: 0 }}
              domain={{ y: [spo2Domain.min, spo2Domain.max] }}
            >
              <VictoryAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'transparent' },
                }}
                tickFormat={(tick: any) => format(new Date(tick), 'MMM d')}
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
              height={190}
              padding={{ top: 24, bottom: 44, left: 48, right: 24 }}
              domainPadding={{ x: 25, y: 0 }}
              domain={{ y: [bpDomain.min, bpDomain.max] }}
            >
              <VictoryAxis
                style={{
                  axis: { stroke: '#E0E0E0' },
                  tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                  grid: { stroke: 'transparent' },
                }}
                tickFormat={(tick: any) => format(new Date(tick), 'MMM d')}
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
                y={2}
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
  }, [dailyAverages.length, hrTrend, spo2Trend, bpTrends, hrDomain, spo2Domain, bpDomain]);

  const headerComponent = useMemo(() => trendHeader, [trendHeader]);

  return (
    <ScreenContainer>
      <FlatList
        data={grouped}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={headerComponent}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{format(new Date(item.date), 'MMMM d, yyyy')}</Text>
            {item.entries.map((s, idx) => {
              const ts = toDate(s.timestamp);
              const badges = getSampleBadges(s);
              const windowLabel = describeSampleWindow(s);
              return (
                <View key={`${item.date}-${idx}`} style={[styles.row, idx === item.entries.length - 1 && styles.rowLast]}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.time}>{format(ts, 'HH:mm')}</Text>
                    <Text style={styles.meta}>HR {formatMetricValue(s.hr, 'bpm')}</Text>
                    <Text style={styles.meta}>{windowLabel}</Text>
                    {badges.length > 0 && (
                      <View style={styles.badgeRow}>
                        {badges.map((badge, badgeIdx) => (
                          <View
                            key={`${item.date}-${idx}-badge-${badgeIdx}`}
                            style={[styles.badge, { backgroundColor: STATUS_COLORS[badge.tone].bg }]}
                          >
                            <Text style={[styles.badgeText, { color: STATUS_COLORS[badge.tone].text }]}>{badge.label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={styles.metrics}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>BP</Text>
                      <Text style={styles.metricValue}>{formatBloodPressure(s.bp_sys, s.bp_dia)}</Text>
                    </View>
                    {typeof s.spo2 === 'number' && (
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>SpO₂</Text>
                        <Text style={styles.metricValue}>{formatMetricValue(s.spo2, '%')}</Text>
                      </View>
                    )}
                    {typeof s.hrv === 'number' && (
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>HRV</Text>
                        <Text style={styles.metricValue}>{formatMetricValue(s.hrv, 'ms')}</Text>
                      </View>
                    )}
                    {typeof s.maternal_health_score === 'number' && (
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Score</Text>
                        <Text style={styles.metricValue}>{formatMetricValue(s.maternal_health_score)}</Text>
                      </View>
                    )}
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
    padding: spacing.md,
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
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border || '#ECEFF1',
    backgroundColor: colors.background,
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
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  rowLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  time: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: typography.small - 2,
    fontWeight: '600',
  },
  metrics: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  metricItem: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: typography.small - 2,
    color: colors.textSecondary,
  },
  metricValue: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    padding: spacing.lg,
  },
});

export default VitalsHistoryScreen;
