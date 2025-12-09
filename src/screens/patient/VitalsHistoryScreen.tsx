import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  dayAverage: {
    hr?: number;
    spo2?: number;
    bpSys?: number;
    bpDia?: number;
    hrv?: number;
    score?: number;
  };
  hourlyAverages: {
    hour: number;
    hr?: number;
    spo2?: number;
    bpSys?: number;
    bpDia?: number;
    hrv?: number;
    score?: number;
    readingCount: number;
  }[];
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
    .map((date) => {
      const entries = map[date].sort((a, b) => ((a.timestamp ?? 0) > (b.timestamp ?? 0) ? -1 : 1));
      
      // Calculate day average
      let hrSum = 0, hrCount = 0;
      let spo2Sum = 0, spo2Count = 0;
      let bpSysSum = 0, bpSysCount = 0;
      let bpDiaSum = 0, bpDiaCount = 0;
      let hrvSum = 0, hrvCount = 0;
      let scoreSum = 0, scoreCount = 0;

      entries.forEach(s => {
        if (typeof s.hr === 'number' && !Number.isNaN(s.hr) && s.hr > 0) { hrSum += s.hr; hrCount++; }
        if (typeof s.spo2 === 'number' && !Number.isNaN(s.spo2) && s.spo2 > 0) { spo2Sum += s.spo2; spo2Count++; }
        if (typeof s.bp_sys === 'number' && !Number.isNaN(s.bp_sys) && s.bp_sys > 0) { bpSysSum += s.bp_sys; bpSysCount++; }
        if (typeof s.bp_dia === 'number' && !Number.isNaN(s.bp_dia) && s.bp_dia > 0) { bpDiaSum += s.bp_dia; bpDiaCount++; }
        if (typeof s.hrv === 'number' && !Number.isNaN(s.hrv) && s.hrv > 0) { hrvSum += s.hrv; hrvCount++; }
        if (typeof s.maternal_health_score === 'number' && !Number.isNaN(s.maternal_health_score) && s.maternal_health_score > 0) { 
          scoreSum += s.maternal_health_score; scoreCount++; 
        }
      });

      // Calculate hourly averages
      const hourlyMap: Record<number, {
        hrSum: number; hrCount: number;
        spo2Sum: number; spo2Count: number;
        bpSysSum: number; bpSysCount: number;
        bpDiaSum: number; bpDiaCount: number;
        hrvSum: number; hrvCount: number;
        scoreSum: number; scoreCount: number;
        readingCountSum: number;
      }> = {};

      entries.forEach(s => {
        const hour = toDate(s.timestamp).getHours();
        if (!hourlyMap[hour]) {
          hourlyMap[hour] = {
            hrSum: 0, hrCount: 0,
            spo2Sum: 0, spo2Count: 0,
            bpSysSum: 0, bpSysCount: 0,
            bpDiaSum: 0, bpDiaCount: 0,
            hrvSum: 0, hrvCount: 0,
            scoreSum: 0, scoreCount: 0,
            readingCountSum: 0,
          };
        }
        const bucket = hourlyMap[hour];
        const readingContribution =
          typeof s.sampleCount === 'number' && s.sampleCount > 0 ? s.sampleCount : 1;
        bucket.readingCountSum += readingContribution;
        if (typeof s.hr === 'number' && !Number.isNaN(s.hr) && s.hr > 0) { 
          bucket.hrSum += s.hr; 
          bucket.hrCount++; 
        }
        if (typeof s.spo2 === 'number' && !Number.isNaN(s.spo2) && s.spo2 > 0) { 
          bucket.spo2Sum += s.spo2; 
          bucket.spo2Count++; 
        }
        if (typeof s.bp_sys === 'number' && !Number.isNaN(s.bp_sys) && s.bp_sys > 0) { 
          bucket.bpSysSum += s.bp_sys; 
          bucket.bpSysCount++; 
        }
        if (typeof s.bp_dia === 'number' && !Number.isNaN(s.bp_dia) && s.bp_dia > 0) { 
          bucket.bpDiaSum += s.bp_dia; 
          bucket.bpDiaCount++; 
        }
        if (typeof s.hrv === 'number' && !Number.isNaN(s.hrv) && s.hrv > 0) { 
          bucket.hrvSum += s.hrv; 
          bucket.hrvCount++; 
        }
        if (typeof s.maternal_health_score === 'number' && !Number.isNaN(s.maternal_health_score) && s.maternal_health_score > 0) {
          bucket.scoreSum += s.maternal_health_score; 
          bucket.scoreCount++;
        }
      });

      const hourlyAverages = Object.entries(hourlyMap)
        .map(([hour, bucket]) => {
          const avgData = {
            hour: parseInt(hour),
            hr: bucket.hrCount ? bucket.hrSum / bucket.hrCount : undefined,
            spo2: bucket.spo2Count ? bucket.spo2Sum / bucket.spo2Count : undefined,
            bpSys: bucket.bpSysCount ? bucket.bpSysSum / bucket.bpSysCount : undefined,
            bpDia: bucket.bpDiaCount ? bucket.bpDiaSum / bucket.bpDiaCount : undefined,
            hrv: bucket.hrvCount ? bucket.hrvSum / bucket.hrvCount : undefined,
            score: bucket.scoreCount ? bucket.scoreSum / bucket.scoreCount : undefined,
            readingCount:
              bucket.readingCountSum || Math.max(bucket.hrCount, bucket.spo2Count, bucket.bpSysCount),
          };
          
          // Debug logging
          if (bucket.hrCount > 0) {
            console.log(`[Hour ${hour}] ${bucket.hrCount} readings: HR avg = ${avgData.hr?.toFixed(1)}`);
          }
          
          return avgData;
        })
        .sort((a, b) => a.hour - b.hour);

      return {
        date,
        entries,
        dayAverage: {
          hr: hrCount ? hrSum / hrCount : undefined,
          spo2: spo2Count ? spo2Sum / spo2Count : undefined,
          bpSys: bpSysCount ? bpSysSum / bpSysCount : undefined,
          bpDia: bpDiaCount ? bpDiaSum / bpDiaCount : undefined,
          hrv: hrvCount ? hrvSum / hrvCount : undefined,
          score: scoreCount ? scoreSum / scoreCount : undefined,
        },
        hourlyAverages,
      };
    });
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

// Generate example data for demonstration
const generateExampleData = (): VitalsSample[] => {
  const now = Date.now();
  const samples: VitalsSample[] = [];
  
  // Generate data for the last 3 days
  for (let day = 0; day < 3; day++) {
    const dayStart = now - (day * 24 * 60 * 60 * 1000);
    
    // Generate 3-5 readings per hour for certain hours
    const hours = day === 0 ? [8, 10, 12, 14, 16, 18, 20] : [9, 12, 15, 18, 21];
    
    hours.forEach(hour => {
      const readingsInHour = 3 + Math.floor(Math.random() * 3); // 3-5 readings
      
      for (let r = 0; r < readingsInHour; r++) {
        const timestamp = dayStart - (24 - hour) * 60 * 60 * 1000 + (r * 15 * 60 * 1000);
        
        samples.push({
          timestamp,
          hr: 70 + Math.floor(Math.random() * 20), // 70-90
          bp_sys: 115 + Math.floor(Math.random() * 15), // 115-130
          bp_dia: 75 + Math.floor(Math.random() * 10), // 75-85
          spo2: 96 + Math.floor(Math.random() * 4), // 96-100
          hrv: 40 + Math.floor(Math.random() * 30), // 40-70
          maternal_health_score: 75 + Math.floor(Math.random() * 20), // 75-95
          rhythm: 'Normal',
          anemia_risk: 'Low',
          preeclampsia_risk: 'Low',
        });
      }
    });
  }
  
  return samples;
};

const VitalsHistoryScreen: React.FC<{ showGraphs?: boolean }> = ({ showGraphs = false }) => {
  const [samples, setSamples] = useState<VitalsSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | 'week' | 'month'>('all');
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    
    setLoading(true);
    
    // Show example data immediately
    setSamples(generateExampleData());
    setLoading(false);
    
    const unsub = subscribeToVitalsHistory(uid, (newSamples) => {
      if (newSamples.length > 0) {
        // Prefer 30-minute aggregated snapshots so history is stable
        const aggregatedOnly = newSamples.filter(
          (sample) => sample.aggregated === true || typeof sample.bucketStart === 'number',
        );
        const filteredSamples = aggregatedOnly.length > 0 ? aggregatedOnly : newSamples;

        if (aggregatedOnly.length === 0) {
          console.log('[VitalsHistory] Falling back to raw samples - no aggregated data yet');
        } else {
          console.log(
            `[VitalsHistory] Using ${filteredSamples.length} aggregated samples out of ${newSamples.length} total`,
          );
        }

        setSamples(filteredSamples);
        setHasRealData(true);
      }
      setLoading(false);
    }, { maxEntries: 336 });
    return () => unsub();
  }, []);

  const dailyAverages = useMemo(() => {
    // Determine how many days to show based on filter
    let daysToShow = 5; // Default for 'all'
    if (timeFilter === 'week') {
      daysToShow = 7;
    } else if (timeFilter === 'month') {
      daysToShow = 30;
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
    const padding = Math.max((max - min) * 0.1, 2);
    const domain = { 
      min: Math.max(70, Math.floor(min - padding)), 
      max: Math.min(100, Math.ceil(max + padding)) 
    };
    return domain;
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

  const filteredGrouped = useMemo(() => {
    if (timeFilter === 'all') return grouped;
    
    const now = new Date();
    const filterDate = new Date();
    
    if (timeFilter === 'week') {
      filterDate.setDate(now.getDate() - 7);
    } else if (timeFilter === 'month') {
      filterDate.setMonth(now.getMonth() - 1);
    }
    
    return grouped.filter(item => new Date(item.date) >= filterDate);
  }, [grouped, timeFilter]);

  const trendHeader = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text style={styles.loaderText}>Loading vitals history...</Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, timeFilter === 'all' && styles.filterButtonActive]}
            onPress={() => setTimeFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterButtonText, timeFilter === 'all' && styles.filterButtonTextActive]}>
              All Time
            </Text>
          </TouchableOpacity>
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
        </View>

        {showGraphs && (
          <View style={styles.chartsContainer}>
        <Text style={styles.title}>Vitals Trends</Text>
        {!hasRealData && (
          <View style={styles.exampleBadge}>
            <Text style={styles.exampleBadgeText}>📊 Previous Data - Connect your LifeBand for real readings</Text>
          </View>
        )}
        <Text style={styles.chartSubtitle}>
          {dailyAverages.length
            ? `Last ${dailyAverages.length} day${dailyAverages.length > 1 ? 's' : ''}`
            : 'Connect your LifeBand to begin tracking.'}
        </Text>
        
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
              <Text style={styles.chartEmptyHint}>Connect your LifeBand to start tracking oxygen levels</Text>
            </View>
          )}
        </View>
        
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
            <Text style={styles.chartEmpty}>Blood pressure trends will populate</Text>
          )}
        </View>
      </View>
        )}
      </>
    );
  }, [loading, dailyAverages.length, hrTrend, spo2Trend, bpTrends, hrDomain, spo2Domain, bpDomain, timeFilter, showGraphs, hasRealData]);

  const headerComponent = useMemo(() => trendHeader, [trendHeader]);

  return (
    <ScreenContainer>
      <FlatList
        data={filteredGrouped}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={headerComponent}
        renderItem={({ item }) => {
          const isExpanded = expandedDay === item.date;
          return (
            <View style={styles.section}>
              <TouchableOpacity 
                onPress={() => setExpandedDay(isExpanded ? null : item.date)}
                activeOpacity={0.7}
              >
                <View style={styles.dayHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>{format(new Date(item.date), 'MMMM d, yyyy')}</Text>
                    <Text style={styles.daySubtitle}>{item.entries.length} reading{item.entries.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </View>
              </TouchableOpacity>

              {!isExpanded && (
                <View style={styles.dayAverageContainer}>
                  <Text style={styles.averageLabel}>Day Average</Text>
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricRow}>
                      <View style={styles.metricBox}>
                        <Text style={styles.metricLabel}>HR</Text>
                        <Text style={styles.metricValue}>{formatMetricValue(item.dayAverage.hr, 'bpm')}</Text>
                      </View>
                      <View style={styles.metricBox}>
                        <Text style={styles.metricLabel}>BP</Text>
                        <Text style={styles.metricValue}>{formatBloodPressure(item.dayAverage.bpSys, item.dayAverage.bpDia)}</Text>
                      </View>
                      {typeof item.dayAverage.spo2 === 'number' && (
                        <View style={styles.metricBox}>
                          <Text style={styles.metricLabel}>SpO₂</Text>
                          <Text style={styles.metricValue}>{formatMetricValue(item.dayAverage.spo2, '%')}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.metricRow}>
                      {typeof item.dayAverage.hrv === 'number' && (
                        <View style={styles.metricBox}>
                          <Text style={styles.metricLabel}>HRV</Text>
                          <Text style={styles.metricValue}>{formatMetricValue(item.dayAverage.hrv, 'ms')}</Text>
                        </View>
                      )}
                      {typeof item.dayAverage.score === 'number' && (
                        <View style={styles.metricBox}>
                          <Text style={styles.metricLabel}>Score</Text>
                          <Text style={styles.metricValue}>{formatMetricValue(item.dayAverage.score)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {isExpanded && (
                <View style={styles.hourlyContainer}>
                  <Text style={styles.averageLabel}>Hourly Averages</Text>
                  {item.hourlyAverages.map((hourData) => (
                    <View key={`${item.date}-hour-${hourData.hour}`} style={styles.hourRow}>
                      <View style={styles.hourLeft}>
                        <Text style={styles.hourTime}>{`${hourData.hour.toString().padStart(2, '0')}:00`}</Text>
                        <Text style={styles.hourMeta}>HR {formatMetricValue(hourData.hr, 'bpm')}</Text>
                        <Text style={styles.hourCount}>Avg of {hourData.readingCount} reading{hourData.readingCount !== 1 ? 's' : ''}</Text>
                      </View>
                      <View style={styles.metricsGrid}>
                        <View style={styles.metricRow}>
                          <View style={styles.metricBox}>
                            <Text style={styles.metricLabel}>BP</Text>
                            <Text style={styles.metricValue}>{formatBloodPressure(hourData.bpSys, hourData.bpDia)}</Text>
                          </View>
                          {typeof hourData.spo2 === 'number' && (
                            <View style={styles.metricBox}>
                              <Text style={styles.metricLabel}>SpO₂</Text>
                              <Text style={styles.metricValue}>{formatMetricValue(hourData.spo2, '%')}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.metricRow}>
                          {typeof hourData.hrv === 'number' && (
                            <View style={styles.metricBox}>
                              <Text style={styles.metricLabel}>HRV</Text>
                              <Text style={styles.metricValue}>{formatMetricValue(hourData.hrv, 'ms')}</Text>
                            </View>
                          )}
                          {typeof hourData.score === 'number' && (
                            <View style={styles.metricBox}>
                              <Text style={styles.metricLabel}>Score</Text>
                              <Text style={styles.metricValue}>{formatMetricValue(hourData.score)}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        }}
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
  loaderContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  filterContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  filterButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  filterButtonText: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  chartsContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  exampleBadge: {
    backgroundColor: 'rgba(229, 115, 115, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  exampleBadgeText: {
    color: colors.primary,
    fontSize: typography.small - 1,
    fontWeight: '600',
  },
  chartSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginBottom: spacing.md,
  },
  chartBlock: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
  },
  chartBlockTitle: {
    fontWeight: '600',
    fontSize: typography.small,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  chartEmpty: {
    color: colors.textSecondary,
    fontSize: typography.small - 1,
    fontStyle: 'italic',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  section: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: typography.body,
    color: colors.textPrimary,
  },
  daySubtitle: {
    fontSize: typography.small - 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '600',
  },
  dayAverageContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  averageLabel: {
    fontSize: typography.small - 1,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hourlyContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.04)',
  },
  hourLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  hourTime: {
    fontWeight: '700',
    fontSize: typography.body - 1,
    color: colors.secondary,
    marginBottom: 2,
  },
  hourMeta: {
    color: colors.textSecondary,
    fontSize: typography.small - 1,
  },
  hourCount: {
    color: colors.textSecondary,
    fontSize: typography.small - 2,
    fontStyle: 'italic',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  rowLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  time: {
    fontWeight: '700',
    fontSize: typography.body,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.small - 1,
    marginBottom: 1,
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
  metricsGrid: {
    gap: spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricBox: {
    backgroundColor: 'rgba(40, 53, 147, 0.04)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    minWidth: 68,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: typography.small - 3,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 1,
  },
  metricValue: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.secondary,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    padding: spacing.xl,
    fontSize: typography.body,
  },
  chartEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  chartEmptyIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  chartEmptyHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  chartDebug: {
    fontSize: 11,
    color: colors.primary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
});

export default VitalsHistoryScreen;
