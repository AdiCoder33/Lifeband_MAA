import React, { useCallback, useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity, FlatList, Linking, Image } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth, firestore } from '../../services/firebase';
import { subscribeDoctorAppointments } from '../../services/appointmentService';
import { Appointment } from '../../types/appointment';
import { collection, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DoctorStackParamList } from '../../types/navigation';
import { UserProfile } from '../../types/user';
import { format } from 'date-fns';
import { subscribeToLatestVitals } from '../../services/vitalsService';
import { VitalsSample } from '../../types/vitals';
import { shadows } from '../../theme/theme';
import { signOutUser } from '../../services/authService';

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorHome'> & {
  profile?: UserProfile | null;
};

type PatientSummaryEntry = {
  profile: UserProfile;
  vitals: VitalsSample | null;
};

type RiskEntry = {
  profile: UserProfile;
  issues: string[];
  score: number;
  lastReading: number;
};

type ActiveEntry = {
  profile: UserProfile;
  lastReading: number;
};

const toMillis = (timestamp?: number) => {
  if (!timestamp) return 0;
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '—';
  const asMs = timestamp > 2_000_000_000 ? timestamp : timestamp * 1000;
  return format(new Date(asMs), 'HH:mm');
};

const getGreeting = () => {
  const istTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const hour = new Date(istTime).getHours();
  
  if (hour >= 5 && hour < 12) {
    return {
      greeting: 'Good Morning',
      caption: "Start your day empowering mothers and babies with care."
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      greeting: 'Good Afternoon',
      caption: "Your dedication brings health and hope to families."
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      greeting: 'Good Evening',
      caption: "Review the day's insights and prepare for tomorrow."
    };
  } else {
    return {
      greeting: 'Good Night',
      caption: "Rest well, Doctor. Your patients are in good hands."
    };
  }
};

const DoctorDashboardScreen: React.FC<Props> = ({ navigation, profile }) => {
  const uid = auth.currentUser?.uid;
  const [patientCount, setPatientCount] = useState(0);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [nextAppointments, setNextAppointments] = useState<Appointment[]>([]);
  const [patientSummaries, setPatientSummaries] = useState<PatientSummaryEntry[]>([]);
  const patientUnsubs = useRef<Record<string, () => void>>({});

  const patientPages = useMemo(() => {
    const chunkSize = 10;
    const pages: typeof patientSummaries[] = [];
    for (let i = 0; i < patientSummaries.length; i += chunkSize) {
      pages.push(patientSummaries.slice(i, i + chunkSize));
    }
    return pages;
  }, [patientSummaries]);

  const riskPatients = useMemo<RiskEntry[]>(() => {
    return patientSummaries
      .map((entry) => {
        if (!entry.vitals) return null;
        const { bp_sys, bp_dia, spo2, hr, timestamp } = entry.vitals;
        const issues: string[] = [];
        let score = 0;
        if (bp_sys >= 140 || bp_dia >= 90) {
          issues.push(`BP ${bp_sys}/${bp_dia}`);
          score += 2;
        }
        if (typeof spo2 === 'number' && spo2 < 95) {
          issues.push(`SpO₂ ${spo2}%`);
          score += 3;
        }
        if (hr >= 110) {
          issues.push(`HR ${hr} bpm`);
          score += 1;
        }
        if (!issues.length) return null;
        return {
          profile: entry.profile,
          issues,
          score,
          lastReading: toMillis(timestamp),
        } as RiskEntry;
      })
      .filter((entry): entry is RiskEntry => entry !== null)
      .sort((a, b) => (b.score - a.score) || (b.lastReading - a.lastReading))
      .slice(0, 3);
  }, [patientSummaries]);

  const activePatients = useMemo<ActiveEntry[]>(() => {
    if (!patientSummaries.length) return [];
    const ranked = patientSummaries
      .map((entry) => ({
        profile: entry.profile,
        lastReading: entry.vitals ? toMillis(entry.vitals.timestamp) : 0,
      }))
      .sort((a, b) => b.lastReading - a.lastReading);

    const recent = ranked.filter((item) => item.lastReading > 0).slice(0, 3);
    if (recent.length >= 3) {
      return recent;
    }
    const remainderNeeded = 3 - recent.length;
    const fallback = ranked.filter((item) => item.lastReading === 0).slice(0, remainderNeeded);
    return [...recent, ...fallback];
  }, [patientSummaries]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Sign out failed', message);
    }
  }, []);

  const handleReviewPatient = useCallback(() => {
    navigation.navigate('DoctorPatients');
  }, [navigation]);

  const handleMessagePatient = useCallback((patient: UserProfile) => {
    if (!patient.email) {
      Alert.alert('Missing email', `Add an email address for ${patient.name} to send a message.`);
      return;
    }
    Linking.openURL(`mailto:${encodeURIComponent(patient.email)}`).catch(() =>
      Alert.alert('Unable to compose email', 'Please try again from your mail app.'),
    );
  }, []);

  const handleCallPatient = useCallback((patient: UserProfile) => {
    const phone = (patient as any)?.phoneNumber || (patient as any)?.phone;
    if (!phone) {
      Alert.alert('Missing number', `Add a phone number for ${patient.name} to place a call.`);
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Unable to start call', 'Please try again from your dialer.'),
    );
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionButton} onPress={() => navigation.navigate('DoctorQR')}>
            <Image 
              source={require('../../../assets/QRCode.png')} 
              style={styles.headerQRImage}
              resizeMode="contain"
            />
            <Text style={styles.headerActionLabel}>Share QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerSignOut} onPress={handleSignOut}>
            <Image 
              source={require('../../../assets/Logout.png')} 
              style={styles.headerLogoutImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handleSignOut]);

  useEffect(() => {
    // no-op: patients handled in combined effect below
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDoctorAppointments(uid, (appts) => {
      const now = new Date();
      const upcoming = appts.filter((a) => a.status === 'upcoming' && new Date((a.scheduledAt as any).toDate ? (a.scheduledAt as any).toDate() : a.scheduledAt) >= now);
      setUpcoming(upcoming);
      const sorted = [...upcoming].sort(
        (a, b) =>
          new Date((a.scheduledAt as any).toDate ? (a.scheduledAt as any).toDate() : a.scheduledAt).getTime() -
          new Date((b.scheduledAt as any).toDate ? (b.scheduledAt as any).toDate() : b.scheduledAt).getTime(),
      );
      setNextAppointments(sorted.slice(0, 3));
    });
    return () => unsub();
  }, [uid]);

  // Subscribe to patients and their latest vitals
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(firestore, 'users', uid, 'patients'), async (snap) => {
      // cleanup old listeners
      Object.values(patientUnsubs.current).forEach((u) => u && u());
      patientUnsubs.current = {};

      const summaries: PatientSummaryEntry[] = [];
      for (const d of snap.docs) {
        const patientId = (d.data() as any).patientId;
        const psnap = await getDoc(doc(firestore, 'users', patientId));
        if (!psnap.exists()) continue;
        const profile = psnap.data() as UserProfile;
        const defaultSummary = { profile, vitals: null };
        summaries.push(defaultSummary);

        const unsubVitals = subscribeToLatestVitals(patientId, (sample) => {
          setPatientSummaries((prev) => {
            const other = prev.filter((p) => p.profile.uid !== patientId);
            return [...other, { profile, vitals: sample }];
          });
        });
        patientUnsubs.current[patientId] = unsubVitals;
      }
      setPatientSummaries(summaries);
      setPatientCount(summaries.length);
    });
    return () => {
      unsub();
      Object.values(patientUnsubs.current).forEach((u) => u && u());
    };
  }, [uid]);

  const { greeting, caption } = getGreeting();

  return (
    <ScreenContainer scrollable>
      <View style={styles.heroCard}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>{greeting}, Dr. {profile?.name || 'Doctor'}</Text>
          <Text style={styles.heroSubtitle}>{profile?.doctorData?.hospital || 'Your clinic'}</Text>
          <Text style={styles.heroCaption}>{caption}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Image 
            source={require('../../../assets/Doctor.png')} 
            style={styles.heroProfileImage}
            resizeMode="cover"
          />
        </View>
      </View>

        {riskPatients.length > 0 && (
          <View style={[styles.cardFull, styles.alertCard]}>
            <View style={styles.alertHeader}>
              <Text style={styles.cardTitle}>Critical Alerts</Text>
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>{riskPatients.length}</Text>
              </View>
            </View>
            {riskPatients.map((entry, index) => (
              <View
                key={entry.profile.uid}
                style={[styles.alertRow, index === riskPatients.length - 1 && styles.rowLast]}
              >
                <View style={styles.alertInfo}>
                  <Text style={styles.alertName}>{entry.profile.name}</Text>
                  <Text style={styles.alertMeta}>{entry.issues.join(' · ')}</Text>
                </View>
                <TouchableOpacity style={styles.alertAction} onPress={handleReviewPatient}>
                  <Text style={styles.alertActionText}>Review</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.alertFooter}>Flagged when vitals cross safe thresholds so you can prioritise outreach.</Text>
          </View>
        )}

        {activePatients.length > 0 && (
          <View style={[styles.cardFull, styles.contactCard]}>
            <Text style={styles.cardTitle}>Quick Connect</Text>
            <Text style={styles.cardCopy}>Reach out to the patients with the freshest readings.</Text>
            {activePatients.map((entry, index) => (
              <View
                key={entry.profile.uid}
                style={[styles.contactRow, index === activePatients.length - 1 && styles.rowLast]}
              >
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{entry.profile.name}</Text>
                  <Text style={styles.contactMeta}>
                    {entry.lastReading
                      ? `Last reading ${format(new Date(entry.lastReading), 'MMM d, HH:mm')}`
                      : 'Awaiting first reading'}
                  </Text>
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity
                    style={styles.contactButton}
                    onPress={() => handleMessagePatient(entry.profile)}
                  >
                    <Text style={styles.contactButtonIcon}>✉️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.contactButton, styles.contactButtonAccent]}
                    onPress={() => handleCallPatient(entry.profile)}
                  >
                    <Text style={styles.contactButtonIcon}>📞</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

      <View style={styles.cardRow}>
        <TouchableOpacity style={[styles.statCard, styles.card]} onPress={() => navigation.navigate('DoctorPatients')}>
          <Text style={styles.cardLabel}>Patients</Text>
          <Text style={styles.cardValue}>{patientCount}</Text>
        </TouchableOpacity>
        <View style={[styles.statCardAlt, styles.card]}>
          <Text style={styles.cardLabel}>Upcoming Appointments</Text>
          <Text style={styles.cardValue}>{upcoming.length}</Text>
        </View>
      </View>

      <View style={[styles.cardFull, styles.cardAppointments]}>
        <Text style={styles.cardTitle}>Next Appointments</Text>
        {nextAppointments.length === 0 ? (
          <Text style={styles.cardCopy}>No upcoming appointments.</Text>
        ) : (
          nextAppointments.map((a) => (
            <View key={a.id} style={styles.apptRow}>
              <Text style={styles.apptTime}>
                {format(
                  new Date((a.scheduledAt as any).toDate ? (a.scheduledAt as any).toDate() : a.scheduledAt),
                  'MMM d, HH:mm',
                )}
              </Text>
              <Text style={styles.apptReason}>{a.reason || 'Consultation'}</Text>
            </View>
          ))
        )}
        <Button title="View All Appointments" variant="outline" onPress={() => navigation.navigate('DoctorAppointments')} />
      </View>

      <View style={[styles.cardFull, styles.cardPatientsVitals]}>
        <Text style={styles.cardTitle}>Patients & Vitals</Text>
        <Text style={styles.cardCopy}>Monitor vitals from all your linked patients at a glance.</Text>
        {patientSummaries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>👥</Text>
            <Text style={styles.emptyStateText}>No linked patients yet</Text>
            <Text style={styles.emptyStateHint}>Share your QR code to connect with patients</Text>
          </View>
        ) : (
          <View style={styles.tableContainer}>
            <FlatList
              data={patientPages}
              keyExtractor={(_, idx) => `page-${idx}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              renderItem={({ item: page }) => (
                <View style={styles.tablePage}>
                  <View style={styles.tableHeader}>
                    <View style={styles.cellName}>
                      <Text style={styles.headerCell}>Patient</Text>
                    </View>
                    <View style={styles.cellVital}>
                      <Text style={styles.headerCell}>HR</Text>
                    </View>
                    <View style={styles.cellVital}>
                      <Text style={styles.headerCell}>BP</Text>
                    </View>
                    <View style={styles.cellVital}>
                      <Text style={styles.headerCell}>SpO₂</Text>
                    </View>
                    <View style={styles.cellStatus}>
                      <Text style={styles.headerCell}>Status</Text>
                    </View>
                  </View>
                  {page.map((p, idx) => {
                    // Check all conditions from vitals data
                    const conditions: string[] = [];
                    
                    if (p.vitals) {
                      // Check Arrhythmia
                      if (p.vitals.arrhythmia_alert) {
                        conditions.push('Arrhythmia');
                      } else if (p.vitals.rhythm && p.vitals.rhythm !== 'Normal') {
                        conditions.push(p.vitals.rhythm);
                      }
                      
                      // Check Anemia
                      if (p.vitals.anemia_alert) {
                        conditions.push('Anemia');
                      } else if (p.vitals.anemia_risk && p.vitals.anemia_risk !== 'Low') {
                        conditions.push(`${p.vitals.anemia_risk} Anemia`);
                      }
                      
                      // Check Preeclampsia
                      if (p.vitals.preeclampsia_alert) {
                        conditions.push('Preeclampsia');
                      } else if (p.vitals.preeclampsia_risk && p.vitals.preeclampsia_risk !== 'Low') {
                        conditions.push(`${p.vitals.preeclampsia_risk} Preeclampsia`);
                      }
                    }
                    
                    // Determine status - if any critical condition exists, show it; otherwise Normal
                    const statusText = !p.vitals ? 'No Data' : conditions.length > 0 ? conditions[0] : 'Normal';
                    const statusColor = !p.vitals ? colors.muted : conditions.length > 0 ? colors.critical : colors.healthy;
                    
                    return (
                    <View key={p.profile.uid} style={[styles.tableRow, idx === page.length - 1 && styles.tableRowLast]}>
                      <View style={styles.cellName}>
                        <Text style={styles.patientName} numberOfLines={1}>{p.profile.name}</Text>
                        <Text style={styles.patientMeta} numberOfLines={1}>
                          {p.vitals ? formatTime(p.vitals.timestamp) : 'No data'}
                        </Text>
                      </View>
                      <View style={styles.cellVital}>
                        <Text style={styles.cellValue}>
                          {p.vitals ? `${p.vitals.hr}` : '—'}
                        </Text>
                        <Text style={styles.cellUnit}>bpm</Text>
                      </View>
                      <View style={styles.cellVital}>
                        <Text style={styles.cellValue}>
                          {p.vitals ? `${p.vitals.bp_sys}/${p.vitals.bp_dia}` : '—'}
                        </Text>
                        <Text style={styles.cellUnit}>mmHg</Text>
                      </View>
                      <View style={styles.cellVital}>
                        <Text style={styles.cellValue}>
                          {typeof p.vitals?.spo2 === 'number' ? `${p.vitals.spo2}%` : '—'}
                        </Text>
                      </View>
                      <View style={styles.cellStatus}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                          <Text style={styles.statusBadgeText}>{statusText}</Text>
                        </View>
                      </View>
                    </View>
                  )})}
                </View>
              )}
            />
            {patientPages.length > 1 && (
              <View style={styles.paginationHint}>
                <Text style={styles.paginationText}>← Swipe to see more patients →</Text>
              </View>
            )}
          </View>
        )}
        <Button
          title="View All Patients"
          variant="outline"
          onPress={() => navigation.navigate('DoctorPatients')}
          style={styles.buttonSpace}
        />
      </View>

    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  heroCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0D7377',
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  heroTextBlock: {
    flex: 1,
    marginRight: spacing.md,
  },
  heroTitle: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    color: '#E0E4FF',
    marginBottom: spacing.xs,
  },
  heroCaption: {
    color: '#CBD0FF',
    fontSize: typography.small,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroProfileImage: {
    width: 64,
    height: 64,
  },
  heroIcon: {
    fontSize: 28,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginLeft: spacing.xs,
  },
  headerSignOut: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    marginLeft: spacing.xs,
  },
  headerActionIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  headerQRImage: {
    width: 16,
    height: 16,
    marginRight: spacing.xs,
    transform: [{ scale: 2.5 }],
  },
  headerActionLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerActionLabelAlt: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.white,
  },
  headerLogoutImage: {
    width: 24,
    height: 24,
    transform: [{ scale: 1.8 }],
  },
  alertCard: {
    backgroundColor: '#FFF4F3',
    borderWidth: 1,
    borderColor: 'rgba(211, 47, 47, 0.12)',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  alertBadge: {
    minWidth: 28,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBadgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.small,
  },
  alertRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211, 47, 47, 0.12)',
  },
  alertInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  alertName: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  alertMeta: {
    color: colors.critical,
    fontSize: typography.small,
    marginTop: 2,
  },
  alertAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.critical,
  },
  alertActionText: {
    color: colors.critical,
    fontWeight: '700',
    fontSize: typography.small,
  },
  alertFooter: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
  contactCard: {
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.12)',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(40, 53, 147, 0.12)',
  },
  contactInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  contactName: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  contactMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
  },
  contactButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  contactButtonAccent: {
    borderColor: colors.primary,
  },
  contactButtonIcon: {
    fontSize: 16,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  subtitle: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statCard: {
    backgroundColor: '#FDECEE',
  },
  statCardAlt: {
    backgroundColor: '#EFE9FF',
  },
  cardLabel: {
    color: colors.textSecondary,
  },
  cardValue: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cardFull: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    marginBottom: spacing.xs,
    color: colors.textPrimary,
  },
  cardCopy: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  cardAppointments: {
    backgroundColor: '#E8F7F4',
  },
  cardPatientsVitals: {
    backgroundColor: '#FFF9E6',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyStateHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tableContainer: {
    marginTop: spacing.sm,
  },
  tablePage: {
    width: 500,
  },
  apptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  apptTime: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  apptReason: {
    color: colors.textSecondary,
  },
  buttonSpace: {
    marginTop: spacing.sm,
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#E0E0E0',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: '#FFC107',
    backgroundColor: '#FFFBF0',
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 193, 7, 0.2)',
    backgroundColor: colors.white,
  },
  tableRowLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
  },
  headerCell: {
    fontWeight: '700',
    fontSize: typography.small,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellName: {
    flex: 2,
    marginRight: spacing.md,
  },
  cellVital: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellStatus: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellValue: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cellUnit: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    minWidth: 50,
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  patientName: {
    fontWeight: '700',
    fontSize: typography.body,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  patientMeta: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  paginationHint: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  paginationText: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  patientVitals: {
    alignItems: 'flex-end',
  },
});

export default DoctorDashboardScreen;

