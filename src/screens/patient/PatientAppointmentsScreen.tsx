import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { subscribePatientAppointments } from '../../services/appointmentService';
import { auth } from '../../services/firebase';
import { Appointment } from '../../types/appointment';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PatientStackParamList } from '../../types/navigation';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<PatientStackParamList, 'PatientAppointments'>;

const PatientAppointmentsScreen: React.FC<Props> = ({ navigation }) => {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribePatientAppointments(uid, setAppointments);
    return () => unsub();
  }, [uid]);

  const filtered = useMemo(() => {
    const now = new Date();
    return appointments.filter((a) => {
      const date = new Date((a.scheduledAt as any).toDate ? (a.scheduledAt as any).toDate() : a.scheduledAt);
      return tab === 'upcoming'
        ? a.status === 'upcoming' && date >= now
        : a.status !== 'upcoming' || date < now;
    });
  }, [appointments, tab]);

  return (
    <ScreenContainer>
      <Text style={styles.title}>My Appointments</Text>
      <View style={styles.tabs}>
        {(['upcoming', 'past'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id || `${item.doctorId}-${item.scheduledAt.toString()}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const date = new Date((item.scheduledAt as any).toDate ? (item.scheduledAt as any).toDate() : item.scheduledAt);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('PatientAppointmentDetail', { appointmentId: item.id! })}
            >
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
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
    backgroundColor: colors.primary,
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

export default PatientAppointmentsScreen;
