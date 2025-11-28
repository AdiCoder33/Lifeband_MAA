import React, { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { UserProfile } from '../../types/user';
import { useLifeBand } from '../../context/LifeBandContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PatientStackParamList } from '../../types/navigation';
import { format } from 'date-fns';
import { getDoctorForPatient } from '../../services/doctorPatientService';
import { auth, firestore } from '../../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

type Props = NativeStackScreenProps<PatientStackParamList, 'PatientHome'> & {
  profile?: UserProfile | null;
};

const calculatePregnancy = (patientData?: UserProfile['patientData']) => {
  if (!patientData) return null;
  const now = new Date();
  let startDate: Date | null = null;
  if (patientData.lmpDate) {
    startDate = new Date(patientData.lmpDate);
  } else if (patientData.eddDate) {
    const edd = new Date(patientData.eddDate);
    startDate = new Date(edd.getTime() - 280 * 24 * 60 * 60 * 1000); // approx 40 weeks
  }
  if (!startDate) return null;
  const diffMs = now.getTime() - startDate.getTime();
  const weeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  const months = Math.floor(weeks / 4);
  return { weeks, months };
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '—';
  const asMs = timestamp > 2_000_000_000 ? timestamp : timestamp * 1000;
  return format(new Date(asMs), 'HH:mm');
};

const PatientDashboardScreen: React.FC<Props> = ({ navigation, profile }) => {
  const { lifeBandState, latestVitals, reconnectIfKnownDevice } = useLifeBand();
  const uid = auth.currentUser?.uid;
  const [doctorName, setDoctorName] = React.useState<string | null>(null);
  const [doctorHospital, setDoctorHospital] = React.useState<string | null>(null);
  const [patientProfile, setPatientProfile] = useState<UserProfile | null>(profile || null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.md }}>
          <TouchableOpacity onPress={() => navigation.navigate('LinkDoctor')}>
            <Text style={{ fontSize: 18 }}>🩺</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('LifeBand')}>
            <Text style={{ fontSize: 18 }}>📶</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    reconnectIfKnownDevice();
  }, [reconnectIfKnownDevice]);

  // Keep patient profile fresh to reflect doctor link changes
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(firestore, 'users', uid), (snap) => {
      if (snap.exists()) {
        setPatientProfile(snap.data() as UserProfile);
      }
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const load = async () => {
      if (!patientProfile?.uid || !patientProfile.doctorId) return;
      const doctor = await getDoctorForPatient(patientProfile.uid);
      if (doctor) {
        setDoctorName(doctor.name);
        setDoctorHospital(doctor.doctorData?.hospital || null);
      }
    };
    load();
  }, [patientProfile?.uid, patientProfile?.doctorId]);

  const statusLabel =
    lifeBandState.connectionState === 'connected'
      ? 'Connected'
      : lifeBandState.connectionState === 'connecting' || lifeBandState.connectionState === 'scanning'
      ? 'Connecting...'
      : 'Not Connected';
  const statusColor =
    lifeBandState.connectionState === 'connected'
      ? colors.healthy
      : lifeBandState.connectionState === 'connecting' || lifeBandState.connectionState === 'scanning'
      ? colors.attention
      : colors.muted;
  const preg = calculatePregnancy(patientProfile?.patientData);

  return (
    <ScreenContainer scrollable>
      <View style={styles.heroCard}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>Hello, {patientProfile?.name || 'Patient'}</Text>
          <Text style={styles.heroSubtitle}>We’re here to support your journey.</Text>
          <Text style={styles.heroCaption}>Stay connected to your LifeBand and your care team.</Text>
        </View>
        <View style={styles.heroBadge}>
          <Text style={styles.heroIcon}>🤰</Text>
        </View>
      </View>

      <View style={[styles.card, styles.cardRose]}>
        <Text style={styles.cardTitle}>Pregnancy Overview</Text>
        {preg ? (
          <Text style={styles.cardCopy}>Month {preg.months}, Week {preg.weeks}</Text>
        ) : (
          <Text style={styles.cardCopy}>Add LMP or EDD to see progress.</Text>
        )}
      </View>

      <View style={[styles.card, styles.cardIndigo]}>
        <Text style={styles.cardTitle}>LifeBand Status</Text>
        <View style={styles.row}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        <Text style={styles.meta}>Last sync: {formatTime(latestVitals?.timestamp)}</Text>
        <Button
          title={lifeBandState.connectionState === 'connected' ? 'Manage LifeBand' : 'Connect LifeBand'}
          onPress={() => navigation.navigate('LifeBand')}
          style={styles.buttonSpace}
        />
      </View>

      <View style={[styles.card, styles.cardMint]}>
        <Text style={styles.cardTitle}>Latest Vitals</Text>
        {latestVitals ? (
          <>
            <View style={styles.metricsRow}>
              <Metric label="HR" value={`${latestVitals.hr} bpm`} />
              <Metric label="BP" value={`${latestVitals.bp_sys} / ${latestVitals.bp_dia} mmHg`} />
              <Metric label="HRV" value={`${latestVitals.hrv} ms`} />
            </View>
            <Text style={styles.meta}>Updated at {formatTime(latestVitals.timestamp)}</Text>
          </>
        ) : (
          <Text style={styles.cardCopy}>No vitals received yet. Connect your LifeBand.</Text>
        )}
        <Button title="View History" variant="outline" onPress={() => navigation.navigate('VitalsHistory')} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Doctor</Text>
        {patientProfile?.doctorId && doctorName ? (
          <>
            <Text style={styles.cardCopy}>{doctorName}</Text>
            {doctorHospital ? <Text style={styles.meta}>{doctorHospital}</Text> : null}
          </>
        ) : (
          <Text style={styles.cardCopy}>No doctor linked.</Text>
        )}
        <Button
          title={patientProfile?.doctorId ? 'Change Doctor (Scan QR)' : 'Link My Doctor (Scan QR)'}
          variant="outline"
          onPress={() => navigation.navigate('LinkDoctor')}
          style={styles.buttonSpace}
        />
      </View>

      <Button
        title="View My Appointments"
        onPress={() => navigation.navigate('PatientAppointments')}
        style={{ marginTop: spacing.sm, marginHorizontal: spacing.lg }}
      />
    </ScreenContainer>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metricBox}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  greeting: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  heroCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
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
    color: '#FDF0F0',
    marginBottom: spacing.xs,
  },
  heroCaption: {
    color: '#FFE5E5',
    fontSize: typography.small,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    fontSize: 28,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardRose: {
    backgroundColor: '#FDECEE',
  },
  cardIndigo: {
    backgroundColor: '#E8ECFF',
  },
  cardMint: {
    backgroundColor: '#E8F7F4',
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cardCopy: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  statusText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  metricBox: {
    flex: 1,
    padding: spacing.sm,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginBottom: spacing.xs,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: '700',
  },
  buttonSpace: {
    marginTop: spacing.sm,
  },
});

export default PatientDashboardScreen;
