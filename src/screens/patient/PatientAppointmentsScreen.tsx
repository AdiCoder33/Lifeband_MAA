import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { subscribePatientAppointments } from '../../services/appointmentService';
import { auth } from '../../services/firebase';
import { Appointment } from '../../types/appointment';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PatientStackParamList } from '../../types/navigation';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

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

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return '#10B981';
      case 'upcoming':
        return colors.primary;
      case 'completed':
        return '#6B7280';
      case 'cancelled':
        return '#EF4444';
      default:
        return colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return '✓';
      case 'upcoming':
        return '📅';
      case 'completed':
        return '✓';
      case 'cancelled':
        return '✕';
      default:
        return '○';
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>My Appointments</Text>
        <Text style={styles.subtitle}>{filtered.length} {tab} appointment{filtered.length !== 1 ? 's' : ''}</Text>
      </View>

      <View style={styles.tabs}>
        {(['upcoming', 'past'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {tab === t && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id || `${item.doctorId}-${item.scheduledAt.toString()}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const date = new Date((item.scheduledAt as any).toDate ? (item.scheduledAt as any).toDate() : item.scheduledAt);
          const statusColor = getStatusColor(item.status);
          const statusIcon = getStatusIcon(item.status);
          const isExpired = isPast(date);

          return (
            <TouchableOpacity
              style={[styles.card, isExpired && styles.cardPast]}
              onPress={() => navigation.navigate('PatientAppointmentDetail', { appointmentId: item.id! })}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <View style={styles.dateContainer}>
                  <View style={[styles.dateBadge, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[styles.dateDay, { color: statusColor }]}>
                      {format(date, 'd')}
                    </Text>
                    <Text style={[styles.dateMonth, { color: statusColor }]}>
                      {format(date, 'MMM')}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.cardTop}>
                    <Text style={styles.dateLabel}>{getDateLabel(date)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[styles.statusIcon, { color: statusColor }]}>{statusIcon}</Text>
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.timeText}>
                    🕐 {format(date, 'h:mm a')}
                  </Text>

                  <Text style={styles.reasonText} numberOfLines={2}>
                    {item.reason || 'General Consultation'}
                  </Text>

                  {item.notes && (
                    <Text style={styles.notesText} numberOfLines={1}>
                      📝 {item.notes}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.viewDetails}>View Details →</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>No {tab} appointments</Text>
            <Text style={styles.emptyText}>
              {tab === 'upcoming'
                ? 'You have no scheduled appointments yet.'
                : 'Your past appointments will appear here.'}
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    alignItems: 'center',
    position: 'relative',
  },
  tabActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tabText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 16,
  },
  tabTextActive: {
    color: colors.white,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 8,
    width: 24,
    height: 3,
    backgroundColor: colors.white,
    borderRadius: 2,
  },
  list: {
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPast: {
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: 'row',
    padding: spacing.lg,
  },
  dateContainer: {
    marginRight: spacing.md,
  },
  dateBadge: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    fontSize: 24,
    fontWeight: '900',
  },
  dateMonth: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dateLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.md,
    gap: 4,
  },
  statusIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  reasonText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  notesText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-end',
  },
  viewDetails: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default PatientAppointmentsScreen;
