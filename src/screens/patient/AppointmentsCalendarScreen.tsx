import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextStyle, ViewStyle } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { Calendar, DateData } from 'react-native-calendars';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth } from '../../services/firebase';
import { subscribePatientAppointments } from '../../services/appointmentService';
import { Appointment } from '../../types/appointment';
import { format } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../services/firebase';
import { UserProfile } from '../../types/user';

const resolveDate = (value: Appointment['scheduledAt']): Date => {
  if (!value) return new Date();
  const maybeFirestore = value as any;
  if (typeof maybeFirestore?.toDate === 'function') {
    return maybeFirestore.toDate();
  }
  return new Date(value as any);
};

type DayStatus = 'upcoming' | 'completed' | 'cancelled' | 'other' | 'selected-only';

const STATUS_COLORS: Record<Exclude<DayStatus, 'selected-only'>, string> = {
  upcoming: colors.secondary,
  completed: '#2E7D32',
  cancelled: colors.critical,
  other: colors.textSecondary,
};

const getDayStatus = (items: Appointment[] = []): DayStatus => {
  if (!items.length) return 'other';
  const normalized = items.map((appt) => (appt.status || '').toLowerCase().trim());
  if (normalized.some((status) => status === 'completed')) return 'completed';
  if (normalized.some((status) => status === 'upcoming' || status === 'scheduled')) return 'upcoming';
  if (normalized.some((status) => status === 'cancelled')) return 'cancelled';
  return 'other';
};

const buildCustomStyles = (status: DayStatus, isSelected: boolean): { container: ViewStyle; text: TextStyle } => {
  const baseColor = status === 'selected-only' ? colors.primary : STATUS_COLORS[status as keyof typeof STATUS_COLORS] || colors.textSecondary;
  return {
    container: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: isSelected ? 0 : 2,
      borderColor: baseColor,
      backgroundColor: isSelected ? baseColor : colors.card,
    },
    text: {
      color: isSelected ? colors.white : colors.textPrimary,
      fontWeight: '700',
    },
  };
};

const AppointmentsCalendarScreen: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [doctorLookup, setDoctorLookup] = useState<Record<string, { name: string; hospital?: string }>>({});
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribePatientAppointments(uid, setAppointments);
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (appointments.length === 0) return;
    const nextUpcoming = appointments
      .filter((appt) => appt.status === 'upcoming')
      .map((appt) => resolveDate(appt.scheduledAt))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (nextUpcoming) {
      setSelectedDate(format(nextUpcoming, 'yyyy-MM-dd'));
    }
  }, [appointments]);

  useEffect(() => {
    const loadDoctors = async () => {
      const uniqueDoctorIds = Array.from(new Set(appointments.map((appt) => appt.doctorId).filter(Boolean)));
      const missingIds = uniqueDoctorIds.filter((id) => !doctorLookup[id]);
      if (!missingIds.length) return;

      const results = await Promise.all(
        missingIds.map(async (id) => {
          try {
            const snapshot = await getDoc(doc(firestore, 'users', id));
            if (snapshot.exists()) {
              const profile = snapshot.data() as UserProfile;
              return {
                id,
                info: {
                  name: profile.name || 'Your care provider',
                  hospital: profile.doctorData?.hospital,
                },
              };
            }
          } catch (error) {
            console.warn('Failed to load doctor for calendar', error);
          }
          return { id, info: { name: 'Your care provider' } };
        }),
      );

      if (!results.length) return;
      setDoctorLookup((prev) => {
        const next = { ...prev };
        results.forEach(({ id, info }) => {
          next[id] = info;
        });
        return next;
      });
    };

    loadDoctors();
  }, [appointments, doctorLookup]);

  const groupedByDay = useMemo(() => {
    return appointments.reduce<Record<string, Appointment[]>>((acc, appt) => {
      const dateKey = format(resolveDate(appt.scheduledAt), 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(appt);
      return acc;
    }, {});
  }, [appointments]);

  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      {
        selected?: boolean;
        customStyles?: {
          container?: ViewStyle;
          text?: TextStyle;
        };
      }
    > = {};

    Object.keys(groupedByDay).forEach((date) => {
      const status = getDayStatus(groupedByDay[date]);
      const isSelected = date === selectedDate;
      marks[date] = {
        selected: isSelected,
        customStyles: buildCustomStyles(status, isSelected),
      };
    });

    if (!marks[selectedDate]) {
      marks[selectedDate] = {
        selected: true,
        customStyles: buildCustomStyles('selected-only', true),
      };
    } else if (!marks[selectedDate].customStyles && marks[selectedDate].selected) {
      marks[selectedDate].customStyles = buildCustomStyles('selected-only', true);
    }

    return marks;
  }, [groupedByDay, selectedDate]);

  const itemsForSelectedDay = groupedByDay[selectedDate]?.sort((a, b) => {
    return resolveDate(a.scheduledAt).getTime() - resolveDate(b.scheduledAt).getTime();
  });

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.content}>
        <Text style={styles.title}>Appointments Calendar</Text>
        <Text style={styles.subtitle}>Tap a date to review visits and plan your week.</Text>
        <View style={styles.calendarWrapper}>
          <Calendar
            markingType="custom"
            onDayPress={onDayPress}
            markedDates={markedDates}
            theme={{
              arrowColor: colors.secondary,
              todayTextColor: colors.secondary,
              textDayFontWeight: '600',
              textMonthFontWeight: '800',
            }}
          />
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { borderColor: colors.secondary }]} />
              <Text style={styles.legendLabel}>Upcoming</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { borderColor: STATUS_COLORS.completed }]} />
              <Text style={styles.legendLabel}>Completed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { borderColor: colors.critical }]} />
              <Text style={styles.legendLabel}>Cancelled</Text>
            </View>
          </View>
        </View>
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>{format(new Date(selectedDate), 'MMMM d, yyyy')}</Text>
          {itemsForSelectedDay && itemsForSelectedDay.length > 0 ? (
            itemsForSelectedDay.map((appt) => {
              const scheduled = resolveDate(appt.scheduledAt);
              const doctorInfo = doctorLookup[appt.doctorId];
              return (
                <View key={appt.id || `${appt.doctorId}-${scheduled.getTime()}`} style={styles.appointmentRow}>
                  <View style={styles.appointmentTimeBlock}>
                    <Text style={styles.timeValue}>{format(scheduled, 'HH:mm')}</Text>
                    <Text style={styles.statusBadge}>{appt.status}</Text>
                  </View>
                  <View style={styles.appointmentBody}>
                    <Text style={styles.reason}>{appt.reason || 'Consultation'}</Text>
                    <Text style={styles.meta}>
                      {doctorInfo?.name || 'Care team member'}
                      {doctorInfo?.hospital ? ` · ${doctorInfo.hospital}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyState}>No appointments on this day.</Text>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  calendarWrapper: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    marginRight: spacing.xs,
  },
  legendLabel: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  detailCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  detailTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  appointmentRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(40, 53, 147, 0.08)',
  },
  appointmentTimeBlock: {
    width: 96,
  },
  timeValue: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusBadge: {
    marginTop: spacing.xs,
    color: colors.secondary,
    fontSize: typography.small,
    fontWeight: '700',
  },
  appointmentBody: {
    flex: 1,
  },
  reason: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  meta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  emptyState: {
    color: colors.textSecondary,
  },
});

export default AppointmentsCalendarScreen;
