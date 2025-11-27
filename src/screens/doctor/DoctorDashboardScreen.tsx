import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('DoctorQR')} style={styles.linkIcon}>
          <Text style={styles.linkIconText}>🔗</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
    <ScreenContainer scrollable>
      <Text style={styles.title}>Hello, Dr. {profile?.name || 'Doctor'}</Text>
      <Text style={styles.subtitle}>{profile?.doctorData?.hospital || 'Your clinic'}</Text>

      <View style={styles.cardRow}>
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('DoctorPatients')}>
          <Text style={styles.cardLabel}>Patients</Text>
          <Text style={styles.cardValue}>{patientCount}</Text>
        </TouchableOpacity>
        <View style={styles.card}>
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
          patientSummaries.map((p) => (
            <View key={p.profile.uid} style={styles.patientRow}>
              <View>
                <Text style={styles.patientName}>{p.profile.name}</Text>
                <Text style={styles.patientMeta}>{p.profile.email}</Text>
              </View>
              <View style={styles.patientVitals}>
                {p.vitals ? (
                  <>
                    <Text style={styles.patientMeta}>HR {p.vitals.hr}</Text>
                    <Text style={styles.patientMeta}>
                      BP {p.vitals.bp_sys}/{p.vitals.bp_dia}
                    </Text>
                    <Text style={styles.patientMeta}>HRV {p.vitals.hrv}</Text>
                  </>
                ) : (
                  <Text style={styles.patientMeta}>No vitals</Text>
                )}
              </View>
            </View>
          ))
        )}
        <Button title="View All Patients" variant="outline" onPress={() => navigation.navigate('DoctorPatients')} />
      </View>

    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  linkIcon: {
    paddingHorizontal: spacing.md,
  },
  linkIconText: {
    fontSize: 20,
  },
  subtitle: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radii.lg,
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
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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

