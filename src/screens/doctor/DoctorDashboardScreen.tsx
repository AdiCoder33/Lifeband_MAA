import React, { useCallback, useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity, FlatList, Linking } from 'react-native';
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
  return timestamp > 2_000_000_000 ? timestamp : timestamp * 1000;
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
            <Text style={styles.headerActionIcon}>🔗</Text>
            <Text style={styles.headerActionLabel}>Share QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerActionButton, styles.headerSignOut]} onPress={handleSignOut}>
            <Text style={styles.headerActionLabelAlt}>Sign out</Text>
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

  return (
    <ScreenContainer scrollable>
      <View style={styles.heroCard}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>Hello, Dr. {profile?.name || 'Doctor'}</Text>
          <Text style={styles.heroSubtitle}>{profile?.doctorData?.hospital || 'Your clinic'}</Text>
          <Text style={styles.heroCaption}>Keep your patients close and visits organized.</Text>
        </View>
        <View style={styles.heroBadge}>
          <Text style={styles.heroIcon}>🩺</Text>
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
          <Text style={styles.cardLabel}>Upcoming</Text>
          <Text style={styles.cardValue}>{upcoming.length}</Text>
        </View>
      </View>

      <View style={styles.cardFull}>
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

      <View style={styles.cardFull}>
        <Text style={styles.cardTitle}>Patients & Vitals</Text>
        {patientSummaries.length === 0 ? (
          <Text style={styles.cardCopy}>No linked patients yet.</Text>
        ) : (
          <FlatList
            data={patientPages}
            keyExtractor={(_, idx) => `page-${idx}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={({ item: page }) => (
              <View style={styles.tablePage}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, styles.cellName]}>Patient</Text>
                  <Text style={styles.headerCell}>BP</Text>
                  <Text style={styles.headerCell}>HR</Text>
                  <Text style={styles.headerCell}>HRV</Text>
                  <Text style={styles.headerCell}>SpO₂</Text>
                </View>
                {page.map((p) => (
                  <View key={p.profile.uid} style={styles.tableRow}>
                    <View style={styles.cellName}>
                      <Text style={styles.patientName}>{p.profile.name}</Text>
                      <Text style={styles.patientMeta}>{p.profile.email}</Text>
                    </View>
                    <Text style={styles.cellValue}>
                      {p.vitals ? `${p.vitals.bp_sys}/${p.vitals.bp_dia}` : '—'}
                    </Text>
                    <Text style={styles.cellValue}>{p.vitals ? p.vitals.hr : '—'}</Text>
                    <Text style={styles.cellValue}>{p.vitals ? p.vitals.hrv : '—'}</Text>
                    <Text style={styles.cellValue}>
                      {typeof p.vitals?.spo2 === 'number' ? `${p.vitals.spo2}%` : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          />
        )}
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
    backgroundColor: colors.secondary,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginHorizontal: 0,
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: colors.primary,
  },
  headerActionIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
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
    paddingHorizontal: 0,
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
    backgroundColor: '#EDF0FF',
  },
  statCardAlt: {
    backgroundColor: '#FCE7E7',
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
    marginHorizontal: 0,
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
  tablePage: {
    width: 340,
    paddingHorizontal: spacing.sm,
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
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#E0E0E0',
    backgroundColor: '#F3F4FF',
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#E0E0E0',
    backgroundColor: colors.white,
  },
  headerCell: {
    flex: 1,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cellName: {
    flex: 2,
  },
  cellValue: {
    flex: 1,
    color: colors.textPrimary,
  },
  patientName: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  patientMeta: {
    color: colors.textSecondary,
  },
  patientVitals: {
    alignItems: 'flex-end',
  },
});

export default DoctorDashboardScreen;

