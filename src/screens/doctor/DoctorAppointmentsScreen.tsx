import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Button from '../../components/Button';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { subscribeDoctorAppointments } from '../../services/appointmentService';
import { auth } from '../../services/firebase';
import { Appointment } from '../../types/appointment';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DoctorStackParamList } from '../../types/navigation';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorAppointments'>;

const tabs = ['upcoming', 'completed', 'cancelled'] as const;

const DoctorAppointmentsScreen: React.FC<Props> = ({ navigation }) => {
  const [tab, setTab] = useState<(typeof tabs)[number]>('upcoming');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDoctorAppointments(uid, setAppointments);
    return () => unsub();
  }, [uid]);

  const filtered = useMemo(() => appointments.filter((a) => a.status === tab), [appointments, tab]);

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Appointments</Text>
        <Button title="Create" onPress={() => navigation.navigate('DoctorCreateAppointment')} />
      </View>
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id || `${item.patientId}-${item.scheduledAt.toString()}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const date = new Date((item.scheduledAt as any).toDate ? (item.scheduledAt as any).toDate() : item.scheduledAt);
          return (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('DoctorAppointmentDetail', { appointmentId: item.id! })}>
              <Text style={styles.cardTitle}>{format(date, 'MMM d, HH:mm')}</Text>
              <Text style={styles.cardCopy}>{item.reason || 'Consultation'}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No {tab} appointments.</Text>}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginRight: spacing.sm,
    backgroundColor: colors.card,
  },
  tabActive: {
    backgroundColor: colors.secondary,
  },
  tabText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.white,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  cardTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardCopy: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  status: {
    marginTop: spacing.xs,
    color: colors.secondary,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    padding: spacing.lg,
  },
});

export default DoctorAppointmentsScreen;
