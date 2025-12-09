import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { subscribePatientAppointments } from '../../services/appointmentService';
import { auth, firestore } from '../../services/firebase';
import { Appointment, AppointmentStatus } from '../../types/appointment';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PatientStackParamList } from '../../types/navigation';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { Calendar, DateData } from 'react-native-calendars';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '../../types/user';

type Props = NativeStackScreenProps<PatientStackParamList, 'PatientAppointments'>;

type DayStatus = 'upcoming' | 'completed' | 'cancelled' | 'other' | 'selected-only';

const PatientAppointmentsScreen: React.FC<Props> = ({ navigation }) => {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [doctorLookup, setDoctorLookup] = useState<Record<string, { name: string; hospital?: string }>>({});
  const uid = auth.currentUser?.uid;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={styles.calendarNavButton}
          onPress={() => setShowCalendar(!showCalendar)}
          activeOpacity={0.7}
        >
          <View style={styles.calendarNavContent}>
            <Text style={styles.calendarNavIcon}>📅</Text>
            <Text style={styles.calendarNavText}>Calendar</Text>
          </View>
        </TouchableOpacity>
      ),
    });
  }, [navigation, showCalendar]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribePatientAppointments(uid, setAppointments);
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (appointments.length === 0) return;
    const nextUpcoming = appointments
      .filter((appt) => appt.status === 'upcoming')
      .map((appt) => new Date((appt.scheduledAt as any).toDate ? (appt.scheduledAt as any).toDate() : appt.scheduledAt))
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
            console.warn('Failed to load doctor', error);
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

  const filtered = useMemo(() => {
    const now = new Date();
    const items = appointments.filter((a) => {
      const date = new Date((a.scheduledAt as any).toDate ? (a.scheduledAt as any).toDate() : a.scheduledAt);
      return tab === 'upcoming'
        ? a.status === 'upcoming' && date >= now
        : a.status !== 'upcoming' || date < now;
    });
    
    // Remove duplicates based on date, time, and doctor
    const seen = new Map();
    return items.filter((appt) => {
      const date = new Date((appt.scheduledAt as any).toDate ? (appt.scheduledAt as any).toDate() : appt.scheduledAt);
      const key = `${format(date, 'yyyy-MM-dd-HH:mm')}-${appt.doctorId}`;
      if (seen.has(key)) return false;
      seen.set(key, true);
      return true;
    });
  }, [appointments, tab]);

  const groupedByDay = useMemo(() => {
    return appointments.reduce<Record<string, Appointment[]>>((acc, appt) => {
      const date = new Date((appt.scheduledAt as any).toDate ? (appt.scheduledAt as any).toDate() : appt.scheduledAt);
      const dateKey = format(date, 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(appt);
      return acc;
    }, {});
  }, [appointments]);

  const getStatusCounts = (items: Appointment[] = []) => {
    const now = new Date();
    const counts = { upcoming: 0, completed: 0, cancelled: 0 };
    
    items.forEach((appt) => {
      const apptDate = new Date((appt.scheduledAt as any).toDate ? (appt.scheduledAt as any).toDate() : appt.scheduledAt);
      let status = appt.status;
      if (status === 'upcoming' && apptDate < now) {
        status = 'cancelled';
      }
      if (status === 'completed') counts.completed++;
      else if (status === 'upcoming') counts.upcoming++;
      else if (status === 'cancelled') counts.cancelled++;
    });
    
    return counts;
  };

  const getDayStatus = (items: Appointment[] = []): DayStatus => {
    if (!items.length) return 'other';
    const counts = getStatusCounts(items);
    
    // Priority: completed > upcoming > cancelled
    if (counts.completed > 0) return 'completed';
    if (counts.upcoming > 0) return 'upcoming';
    if (counts.cancelled > 0) return 'cancelled';
    return 'other';
  };

  const STATUS_COLORS: Record<Exclude<DayStatus, 'selected-only'>, string> = {
    upcoming: colors.secondary,
    completed: '#2E7D32',
    cancelled: '#EF4444',
    other: colors.textSecondary,
  };

  const buildCustomStyles = (status: DayStatus, isSelected: boolean, items: Appointment[] = []) => {
    const counts = getStatusCounts(items);
    const hasMultiple = (counts.completed > 0 ? 1 : 0) + (counts.upcoming > 0 ? 1 : 0) + (counts.cancelled > 0 ? 1 : 0) > 1;
    
    let baseColor = status === 'selected-only' ? colors.primary : STATUS_COLORS[status as keyof typeof STATUS_COLORS] || colors.textSecondary;
    
    // For mixed status, use gradient or primary color
    if (hasMultiple && !isSelected) {
      baseColor = colors.primary;
    }
    
    return {
      container: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        borderWidth: isSelected ? 0 : 2,
        borderColor: baseColor,
        backgroundColor: isSelected ? baseColor : (hasMultiple ? 'rgba(139, 92, 246, 0.1)' : colors.card),
      },
      text: {
        color: isSelected ? colors.white : colors.textPrimary,
        fontWeight: '700' as const,
      },
    };
  };

  const markedDates = useMemo(() => {
    const marks: Record<string, { selected?: boolean; customStyles?: any }> = {};
    Object.keys(groupedByDay).forEach((date) => {
      const status = getDayStatus(groupedByDay[date]);
      const isSelected = date === selectedDate;
      marks[date] = {
        selected: isSelected,
        customStyles: buildCustomStyles(status, isSelected, groupedByDay[date]),
      };
    });
    if (!marks[selectedDate]) {
      marks[selectedDate] = {
        selected: true,
        customStyles: buildCustomStyles('selected-only', true),
      };
    }
    return marks;
  }, [groupedByDay, selectedDate]);

  const itemsForSelectedDay = groupedByDay[selectedDate]?.sort((a, b) => {
    const dateA = new Date((a.scheduledAt as any).toDate ? (a.scheduledAt as any).toDate() : a.scheduledAt);
    const dateB = new Date((b.scheduledAt as any).toDate ? (b.scheduledAt as any).toDate() : b.scheduledAt);
    return dateA.getTime() - dateB.getTime();
  });

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d, yyyy');
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return '#10B981';
      case 'upcoming':
        return colors.secondary; // Pink color
      case 'completed':
        return '#2E7D32'; // Green
      case 'cancelled':
        return '#EF4444'; // Red
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
    <ScreenContainer scrollable={showCalendar}>
      <View style={styles.header}>
        <Text style={styles.title}>My Appointments</Text>
        <Text style={styles.subtitle}>
          {showCalendar 
            ? 'Tap a date to view appointments' 
            : `${filtered.length} ${tab} appointment${filtered.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {showCalendar ? (
        <View style={styles.calendarContainer}>
          <View style={styles.calendarWrapper}>
            <Calendar
              markingType="custom"
              onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
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
                <View style={[styles.legendIndicator, { backgroundColor: '#2E7D32' }]} />
                <Text style={styles.legendLabel}>Completed</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendIndicator, { backgroundColor: colors.secondary }]} />
                <Text style={styles.legendLabel}>Upcoming</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendIndicator, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.legendLabel}>Cancelled</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendIndicator, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendLabel}>Mixed</Text>
              </View>
            </View>
          </View>

          <View style={styles.detailCard}>
            {itemsForSelectedDay && itemsForSelectedDay.length > 0 ? (
              <>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>{format(new Date(selectedDate), 'MMMM d, yyyy')}</Text>
                  <View style={styles.statsRow}>
                    {(() => {
                      const counts = getStatusCounts(itemsForSelectedDay);
                      return (
                        <>
                          {counts.completed > 0 && (
                            <View style={[styles.statBadge, { backgroundColor: '#E8F5E9' }]}>
                              <Text style={[styles.statIcon, { color: '#2E7D32' }]}>✓</Text>
                              <Text style={[styles.statText, { color: '#2E7D32' }]}>{counts.completed}</Text>
                            </View>
                          )}
                          {counts.upcoming > 0 && (
                            <View style={[styles.statBadge, { backgroundColor: 'rgba(255, 12, 174, 0.1)' }]}>
                              <Text style={[styles.statIcon, { color: colors.secondary }]}>📅</Text>
                              <Text style={[styles.statText, { color: colors.secondary }]}>{counts.upcoming}</Text>
                            </View>
                          )}
                          {counts.cancelled > 0 && (
                            <View style={[styles.statBadge, { backgroundColor: '#FFEBEE' }]}>
                              <Text style={[styles.statIcon, { color: '#EF4444' }]}>✕</Text>
                              <Text style={[styles.statText, { color: '#EF4444' }]}>{counts.cancelled}</Text>
                            </View>
                          )}
                        </>
                      );
                    })()}
                  </View>
                </View>
                {itemsForSelectedDay.map((appt) => {
                const scheduled = new Date((appt.scheduledAt as any).toDate ? (appt.scheduledAt as any).toDate() : appt.scheduledAt);
                const doctorInfo = doctorLookup[appt.doctorId];
                const now = new Date();
                let displayStatus = appt.status;
                if (appt.status === 'upcoming' && scheduled < now) {
                  displayStatus = 'cancelled';
                }
                
                const getStatusColorForCalendar = (status: AppointmentStatus) => {
                  switch (status) {
                    case 'upcoming':
                      return colors.secondary;
                    case 'completed':
                      return '#2E7D32';
                    case 'cancelled':
                      return '#EF4444';
                    default:
                      return colors.textSecondary;
                  }
                };
                
                return (
                  <View key={appt.id || `${appt.doctorId}-${scheduled.getTime()}`} style={styles.appointmentRow}>
                    <View style={styles.appointmentTimeBlock}>
                      <Text style={styles.timeValue}>{format(scheduled, 'HH:mm')}</Text>
                      <Text style={[styles.statusBadgeText, { color: getStatusColorForCalendar(displayStatus) }]}>
                        {displayStatus}
                      </Text>
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
                })}
              </>
            ) : (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateIcon}>🏥</Text>
                <Text style={styles.emptyStateText}>No appointments on this day</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <>
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
              const now = new Date();
              
              // Auto-cancel overdue appointments
              let displayStatus = item.status;
              if (item.status === 'upcoming' && date < now) {
                displayStatus = 'cancelled';
              }
              
              // Use calendar colors
              const getCardStatusColor = (status: AppointmentStatus) => {
                switch (status) {
                  case 'upcoming':
                    return colors.secondary; // Pink
                  case 'completed':
                    return '#2E7D32'; // Green
                  case 'cancelled':
                    return '#EF4444'; // Red
                  default:
                    return colors.textSecondary;
                }
              };
              
              const statusColor = getCardStatusColor(displayStatus);
              const statusIcon = getStatusIcon(displayStatus);
              const isExpired = isPast(date);

              return (
                <TouchableOpacity
                  style={[styles.card, { borderLeftColor: statusColor }]}
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
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                          <Text style={[styles.statusIcon, { color: statusColor }]}>{statusIcon}</Text>
                          <Text style={[styles.statusText, { color: statusColor }]}>
                            {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
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
                <Text style={styles.emptyIcon}>🏥</Text>
                <Text style={styles.emptyTitle}>No {tab} appointments</Text>
                <Text style={styles.emptyText}>
                  {tab === 'upcoming'
                    ? 'You have no scheduled appointments yet.'
                    : 'Your past appointments will appear here.'}
                </Text>
              </View>
            }
          />
        </>
      )}
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
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  cardPast: {
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dateContainer: {
    marginRight: spacing.sm,
  },
  dateBadge: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '900',
  },
  dateMonth: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  appointmentIcon: {
    fontSize: 28,
  },
  cardContent: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    gap: 3,
  },
  statusIcon: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  reasonText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  notesText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(40, 53, 147, 0.08)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  viewDetails: {
    fontSize: 13,
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
  calendarNavButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  calendarNavContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calendarNavIcon: {
    fontSize: 20,
  },
  calendarNavText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  calendarContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
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
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: spacing.xs,
  },
  legendLabel: {
    fontSize: 11,
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
    minHeight: 200,
  },
  detailHeader: {
    marginBottom: spacing.md,
  },
  detailTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontSize: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    gap: 4,
  },
  statIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  statText: {
    fontSize: 13,
    fontWeight: '700',
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
  statusBadgeText: {
    marginTop: spacing.xs,
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
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
    opacity: 0.3,
  },
  emptyStateText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

export default PatientAppointmentsScreen;
