import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { firestore } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '../../types/user';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DoctorStackParamList } from '../../types/navigation';
import { subscribeToVitalsHistory } from '../../services/vitalsService';
import { VitalsSample } from '../../types/vitals';
import { format } from 'date-fns';
import { VictoryAxis, VictoryChart, VictoryLegend, VictoryLine, VictoryScatter } from 'victory-native';
import { calculatePregnancyProgress } from '../../utils/pregnancy';

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorPatientDetail'>;

const toDate = (timestamp: number) => {
  const asMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(asMs);
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

const DoctorPatientDetailScreen: React.FC<Props> = ({ route }) => {
  const { patientId } = route.params;
  const [patient, setPatient] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [samples, setSamples] = useState<VitalsSample[]>([]);
  const [vitalsLoading, setVitalsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'all'>('week');

  useEffect(() => {
    const loadPatient = async () => {
      try {
        const patientDoc = await getDoc(doc(firestore, 'users', patientId));
        if (patientDoc.exists()) {
          setPatient(patientDoc.data() as UserProfile);
        }
      } catch (error) {
        console.error('Error loading patient:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPatient();
  }, [patientId]);

  useEffect(() => {
    setVitalsLoading(true);
    const unsub = subscribeToVitalsHistory(patientId, (newSamples) => {
      if (newSamples.length > 0) {
        const aggregatedOnly = newSamples.filter(
          (sample) => sample.aggregated === true || typeof sample.bucketStart === 'number',
        );
        const filteredSamples = aggregatedOnly.length > 0 ? aggregatedOnly : newSamples;
        setSamples(filteredSamples);
      }
      setVitalsLoading(false);
    }, { maxEntries: 336 });
    return () => unsub();
  }, [patientId]);

  const dailyAverages = useMemo(() => {
    let daysToShow = 7;
    if (timeFilter === 'month') {
      daysToShow = 30;
    } else if (timeFilter === 'all') {
      daysToShow = 90;
    }
    
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
      if (typeof sample.hr === 'number' && !Number.isNaN(sample.hr) && sample.hr > 0) {
        bucket.hrSum += sample.hr;
        bucket.hrCount += 1;
      }
      if (typeof sample.spo2 === 'number' && !Number.isNaN(sample.spo2) && sample.spo2 >= 0) {
        bucket.spo2Sum += sample.spo2;
        bucket.spo2Count += 1;
      }
      if (typeof sample.bp_sys === 'number' && !Number.isNaN(sample.bp_sys) && sample.bp_sys > 0) {
        bucket.bpSysSum += sample.bp_sys;
        bucket.bpSysCount += 1;
      }
      if (typeof sample.bp_dia === 'number' && !Number.isNaN(sample.bp_dia) && sample.bp_dia > 0) {
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
      .slice(-daysToShow);
  }, [samples, timeFilter]);

  const hrTrend = useMemo(
    () => dailyAverages.filter((d) => typeof d.hrAvg === 'number').map((d) => ({ x: d.date, y: d.hrAvg! })),
    [dailyAverages],
  );

  const spo2Trend = useMemo(() => {
    const trend = dailyAverages
      .filter((d) => typeof d.spo2Avg === 'number' && !isNaN(d.spo2Avg!) && d.spo2Avg! > 0)
      .map((d) => ({ x: d.date, y: d.spo2Avg! }));
    return trend;
  }, [dailyAverages]);

  const bpTrends = useMemo(() => ({
    sys: dailyAverages.filter((d) => typeof d.bpSysAvg === 'number').map((d) => ({ x: d.date, y: d.bpSysAvg! })),
    dia: dailyAverages.filter((d) => typeof d.bpDiaAvg === 'number').map((d) => ({ x: d.date, y: d.bpDiaAvg! })),
  }), [dailyAverages]);

  const hrDomain = useMemo(() => {
    if (hrTrend.length === 0) return { min: 40, max: 200 };
    const values = hrTrend.map(d => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.15 || 10;
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
    const padding = Math.max((max - min) * 0.1, 2);
    return { 
      min: Math.max(70, Math.floor(min - padding)), 
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

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text style={styles.loaderText}>Loading patient details...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!patient) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Patient not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  const preg = calculatePregnancyProgress(patient.patientData);

  return (
    <ScreenContainer scrollable>
      {/* Patient Info Card */}
      <View style={styles.patientCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{patient.name?.charAt(0) || 'P'}</Text>
        </View>
        <View style={styles.patientInfo}>
          <Text style={styles.name}>{patient.name}</Text>
          <Text style={styles.email}>📧 {patient.email}</Text>
          {preg && (
            <Text style={styles.pregnancyInfo}>
              🤰 Week {preg.weeks} • Month {preg.months}
            </Text>
          )}
        </View>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, timeFilter === 'week' && styles.filterButtonActive]}
          onPress={() => setTimeFilter('week')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, timeFilter === 'week' && styles.filterButtonTextActive]}>
            Last Week
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, timeFilter === 'month' && styles.filterButtonActive]}
          onPress={() => setTimeFilter('month')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, timeFilter === 'month' && styles.filterButtonTextActive]}>
            Last Month
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, timeFilter === 'all' && styles.filterButtonActive]}
          onPress={() => setTimeFilter('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, timeFilter === 'all' && styles.filterButtonTextActive]}>
            All Time
          </Text>
        </TouchableOpacity>
      </View>

      {/* Vitals Graphs */}
      {vitalsLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loaderText}>Loading vitals...</Text>
        </View>
      ) : samples.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>No vitals data available</Text>
          <Text style={styles.emptyHint}>Patient needs to connect their LifeBand</Text>
        </View>
      ) : (
        <View style={styles.chartsContainer}>
          <Text style={styles.title}>Vitals Trends</Text>
          <Text style={styles.chartSubtitle}>
            {dailyAverages.length
              ? `Last ${dailyAverages.length} day${dailyAverages.length > 1 ? 's' : ''}`
              : 'No data in selected period'}
          </Text>
          
          {/* Heart Rate Chart */}
          <View style={styles.chartBlock}>
            <Text style={styles.chartBlockTitle}>Heart Rate (bpm)</Text>
            {hrTrend.length >= 2 ? (
              <VictoryChart
                scale={{ x: 'time' }}
                width={320}
                height={140}
                padding={{ top: 12, bottom: 32, left: 38, right: 12 }}
                domainPadding={{ x: 15, y: 0 }}
                domain={{ y: [hrDomain.min, hrDomain.max] }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: colors.border },
                    tickLabels: { fill: colors.textSecondary, fontSize: 9 },
                    grid: { stroke: 'transparent' },
                  }}
                  tickFormat={(tick: any) => format(new Date(tick), 'MMM d')}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: colors.border },
                    tickLabels: { fill: colors.textSecondary, fontSize: 9 },
                    grid: { stroke: 'rgba(40, 53, 147, 0.05)', strokeDasharray: '3,3' },
                  }}
                />
                <VictoryLine
                  interpolation="monotoneX"
                  data={hrTrend}
                  style={{ data: { stroke: '#5C6BC0', strokeWidth: 2.5 } }}
                />
                <VictoryScatter data={hrTrend} size={3.5} style={{ data: { fill: '#5C6BC0' } }} />
              </VictoryChart>
            ) : (
              <Text style={styles.chartEmpty}>Need at least two readings</Text>
            )}
          </View>
          
          {/* SpO2 Chart */}
          <View style={styles.chartBlock}>
            <Text style={styles.chartBlockTitle}>Oxygen Saturation (SpO₂%)</Text>
            {spo2Trend.length >= 1 ? (
              <VictoryChart
                scale={{ x: 'time' }}
                width={320}
                height={140}
                padding={{ top: 20, bottom: 40, left: 45, right: 15 }}
                domainPadding={{ x: 20, y: 5 }}
                domain={{ y: [spo2Domain.min, spo2Domain.max] }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: colors.border },
                    tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                    grid: { stroke: 'transparent' },
                  }}
                  tickFormat={(tick: any) => {
                    try {
                      return format(new Date(tick), 'MMM d');
                    } catch {
                      return '';
                    }
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: colors.border },
                    tickLabels: { fill: colors.textSecondary, fontSize: 10 },
                    grid: { stroke: 'rgba(77, 182, 172, 0.08)', strokeDasharray: '3,3' },
                  }}
                  tickFormat={(t) => `${Math.round(t)}%`}
                />
                {spo2Trend.length > 1 && (
                  <VictoryLine
                    interpolation="natural"
                    data={spo2Trend}
                    style={{ data: { stroke: '#26A69A', strokeWidth: 3 } }}
                  />
                )}
                <VictoryScatter 
                  data={spo2Trend} 
                  size={6} 
                  style={{ data: { fill: '#26A69A', stroke: '#fff', strokeWidth: 2 } }} 
                />
              </VictoryChart>
            ) : (
              <View style={styles.chartEmptyContainer}>
                <Text style={styles.chartEmptyIcon}>💨</Text>
                <Text style={styles.chartEmpty}>No SpO₂ readings yet</Text>
              </View>
            )}
          </View>
          
          {/* Blood Pressure Chart */}
          <View style={styles.chartBlock}>
            <Text style={styles.chartBlockTitle}>Blood Pressure (mmHg)</Text>
            {bpTrends.sys.length >= 2 ? (
              <VictoryChart
                scale={{ x: 'time' }}
                width={320}
                height={150}
                padding={{ top: 20, bottom: 36, left: 38, right: 12 }}
                domainPadding={{ x: 15, y: 0 }}
                domain={{ y: [bpDomain.min, bpDomain.max] }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: colors.border },
                    tickLabels: { fill: colors.textSecondary, fontSize: 9 },
                    grid: { stroke: 'transparent' },
                  }}
                  tickFormat={(tick: any) => format(new Date(tick), 'MMM d')}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: colors.border },
                    tickLabels: { fill: colors.textSecondary, fontSize: 9 },
                    grid: { stroke: 'rgba(40, 53, 147, 0.05)', strokeDasharray: '3,3' },
                  }}
                />
                <VictoryLegend
                  x={42}
                  y={2}
                  orientation="horizontal"
                  gutter={14}
                  data={[
                    { name: 'Systolic', symbol: { fill: '#EF5350', type: 'circle' } },
                    { name: 'Diastolic', symbol: { fill: '#66BB6A', type: 'circle' } },
                  ]}
                  style={{ labels: { fill: colors.textSecondary, fontSize: 10 } }}
                />
                <VictoryLine
                  interpolation="monotoneX"
                  data={bpTrends.sys}
                  style={{ data: { stroke: '#EF5350', strokeWidth: 2.5 } }}
                />
                <VictoryScatter data={bpTrends.sys} size={3.5} style={{ data: { fill: '#EF5350' } }} />
                <VictoryLine
                  interpolation="monotoneX"
                  data={bpTrends.dia}
                  style={{ data: { stroke: '#66BB6A', strokeWidth: 2.5 } }}
                />
                <VictoryScatter data={bpTrends.dia} size={3.5} style={{ data: { fill: '#66BB6A' } }} />
              </VictoryChart>
            ) : (
              <Text style={styles.chartEmpty}>Need at least two readings</Text>
            )}
          </View>
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  patientCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
  },
  patientInfo: {
    flex: 1,
  },
  name: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: typography.heading,
    marginBottom: spacing.xs - 2,
  },
  email: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: '500',
    marginBottom: spacing.xs - 2,
  },
  pregnancyInfo: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  filterButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterButtonText: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  chartsContainer: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  chartSubtitle: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    fontWeight: '500',
  },
  chartBlock: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  chartBlockTitle: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  chartEmpty: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
    fontStyle: 'italic',
  },
  chartEmptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  chartEmptyIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl + spacing.lg,
  },
  loaderText: {
    marginTop: spacing.md,
    fontSize: typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: typography.heading,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl + spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});

export default DoctorPatientDetailScreen;
