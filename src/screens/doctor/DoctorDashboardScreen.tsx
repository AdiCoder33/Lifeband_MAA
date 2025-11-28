import React, { useCallback, useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity, FlatList } from 'react-native';
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

const DoctorDashboardScreen: React.FC<Props> = ({ navigation, profile }) => {
  const uid = auth.currentUser?.uid;
  const [patientCount, setPatientCount] = useState(0);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [nextAppointments, setNextAppointments] = useState<Appointment[]>([]);
  const [patientSummaries, setPatientSummaries] = useState<
    { profile: UserProfile; vitals: VitalsSample | null }[]
  >([]);
  const patientUnsubs = useRef<Record<string, () => void>>({});

  const patientPages = useMemo(() => {
    const chunkSize = 10;
    const pages: typeof patientSummaries[] = [];
    for (let i = 0; i < patientSummaries.length; i += chunkSize) {
      pages.push(patientSummaries.slice(i, i + chunkSize));
    }
    return pages;
  }, [patientSummaries]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Sign out failed', message);
    }
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('DoctorQR')} style={styles.linkIcon}>
            <Text style={styles.linkIconText}>🔗</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignOut} style={styles.linkIcon}>
            <Text style={styles.linkIconText}>🚪</Text>
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

      const summaries: { profile: UserProfile; vitals: VitalsSample | null }[] = [];
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
    <ScreenContainer>
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
                    <Text style={styles.cellValue}>—</Text>
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    fontSize: 28,
  },
  linkIcon: {
    paddingHorizontal: spacing.md,
  },
  linkIconText: {
    fontSize: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
  tablePage: {
    width: 320,
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
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#E0E0E0',
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

