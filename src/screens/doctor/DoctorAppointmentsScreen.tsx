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
      <View style={styles.header}>
        <Text style={styles.title}>Appointments</Text>
        <Text style={styles.subtitle}>Manage your consultation schedule</Text>
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
          const statusColors = {
            upcoming: { bg: 'rgba(77, 182, 172, 0.1)', border: colors.accent, text: colors.accent },
            completed: { bg: 'rgba(67, 160, 71, 0.1)', border: colors.healthy, text: colors.healthy },
            cancelled: { bg: 'rgba(211, 47, 47, 0.1)', border: colors.critical, text: colors.critical },
          };
          const statusColor = statusColors[item.status];
          
          return (
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: statusColor.bg, borderLeftColor: statusColor.border }]} 
              onPress={() => navigation.navigate('DoctorAppointmentDetail', { appointmentId: item.id! })}
            >
              <View style={styles.cardHeader}>
                <View style={styles.dateBadge}>
                  <Text style={styles.dateMonth}>{format(date, 'MMM')}</Text>
                  <Text style={styles.dateDay}>{format(date, 'd')}</Text>
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{format(date, 'EEEE, HH:mm')}</Text>
                  <Text style={styles.cardCopy}>{item.reason || 'Consultation'}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor.border }]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No {tab} appointments.</Text>}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.heading + 2,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#F8F9FA',
    borderWidth: 2,
    borderColor: '#E9ECEF',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dateBadge: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
    textTransform: 'uppercase',
  },
  dateDay: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 20,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: typography.body,
    marginBottom: 2,
  },
  cardCopy: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  statusText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.small - 1,
    textTransform: 'capitalize',
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    padding: spacing.lg,
  },
});

export default DoctorAppointmentsScreen;
