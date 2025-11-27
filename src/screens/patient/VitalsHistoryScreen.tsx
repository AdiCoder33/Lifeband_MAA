import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth } from '../../services/firebase';
import { subscribeToVitalsHistory } from '../../services/vitalsService';
import { VitalsSample } from '../../types/vitals';
import { format } from 'date-fns';

type GroupedItem = {
  date: string;
  entries: VitalsSample[];
};

const groupByDate = (samples: VitalsSample[]): GroupedItem[] => {
  const map: Record<string, VitalsSample[]> = {};
  samples.forEach((s) => {
    const d = new Date((s.timestamp > 2_000_000_000 ? s.timestamp : s.timestamp * 1000));
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

  const grouped = useMemo(() => groupByDate(samples), [samples]);

  return (
    <ScreenContainer>
      <Text style={styles.title}>Vitals History</Text>
      <FlatList
        data={grouped}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{format(new Date(item.date), 'MMMM d, yyyy')}</Text>
            {item.entries.map((s, idx) => {
              const ts = new Date(s.timestamp > 2_000_000_000 ? s.timestamp : s.timestamp * 1000);
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
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  listContent: {
    paddingBottom: spacing.lg,
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
