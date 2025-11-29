import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
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
import { signOutUser } from '../../services/authService';

type Props = NativeStackScreenProps<PatientStackParamList, 'PatientHome'> & {
  profile?: UserProfile | null;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const calculatePregnancy = (patientData?: UserProfile['patientData']) => {
  if (!patientData) return null;
  const now = new Date();
  let startDate: Date | null = null;
  if (patientData.lmpDate) {
    startDate = new Date(patientData.lmpDate);
  } else if (patientData.eddDate) {
    const edd = new Date(patientData.eddDate);
    startDate = new Date(edd.getTime() - 280 * MS_PER_DAY); // approx 40 weeks
  }
  if (!startDate) return null;
  const diffMs = now.getTime() - startDate.getTime();
  const totalDays = Math.max(0, Math.floor(diffMs / MS_PER_DAY));
  const completedWeeks = Math.floor(totalDays / 7);
  const currentWeek = Math.min(40, Math.max(1, completedWeeks + 1));
  const dayOfWeek = totalDays % 7;
  const dueDate = new Date(startDate.getTime() + 280 * MS_PER_DAY);
  const daysRemaining = Math.max(0, Math.floor((dueDate.getTime() - now.getTime()) / MS_PER_DAY));
  const weeksRemaining = Math.floor(daysRemaining / 7);
  const progress = Math.min(totalDays / 280, 1);

  return {
    totalDays,
    currentWeek,
    dayOfWeek,
    dueDate,
    daysRemaining,
    weeksRemaining,
    progress,
  };
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return 'â€”';
  const asMs = timestamp > 2_000_000_000 ? timestamp : timestamp * 1000;
  return format(new Date(asMs), 'HH:mm');
};

const PatientDashboardScreen: React.FC<Props> = ({ navigation, profile }) => {
  const { lifeBandState, latestVitals, reconnectIfKnownDevice } = useLifeBand();
  const uid = auth.currentUser?.uid;
  const [doctorName, setDoctorName] = React.useState<string | null>(null);
  const [patientProfile, setPatientProfile] = useState<UserProfile | null>(profile || null);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Sign out failed', message);
    }
  }, []);

  const handleDoctorIconPress = useCallback(() => {
    if (patientProfile?.doctorId) {
      Alert.alert(
        doctorName ? `Linked to ${doctorName}` : 'Doctor linked',
        'You can change your doctor by scanning a new QR code.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Change doctor',
            style: 'default',
            onPress: () => navigation.navigate('LinkDoctor'),
          },
        ],
      );
      return;
    }
    navigation.navigate('LinkDoctor');
  }, [doctorName, navigation, patientProfile?.doctorId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.navActions}>
          <TouchableOpacity style={styles.navAction} onPress={handleDoctorIconPress}>
            <Text style={styles.navIcon}>ðŸ©º</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navAction} onPress={() => navigation.navigate('LifeBand')}>
            <Text style={styles.navIcon}>ðŸ“¡</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navAction, styles.navSignOutAction]} onPress={handleSignOut}>
            <Text style={styles.navLabel}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handleSignOut, handleDoctorIconPress]);

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
      }
    };
    load();
  }, [patientProfile?.uid, patientProfile?.doctorId]);

  const preg = calculatePregnancy(patientProfile?.patientData);
  const pregnancyWeek = preg?.currentWeek ?? null;
  const daysRemaining = preg?.daysRemaining ?? null;
  const currentWeekLabel = pregnancyWeek !== null ? `${pregnancyWeek}` : 'â€”';
  const daysRemainingLabel =
    daysRemaining !== null && daysRemaining !== undefined ? `${daysRemaining}` : 'â€”';
  const trimesterLabel = pregnancyWeek
    ? pregnancyWeek <= 13
      ? '1st Trimester'
      : pregnancyWeek <= 27
      ? '2nd Trimester'
      : '3rd Trimester'
    : 'â€”';
  const weightGainSample = '12.5';

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

  const usingSampleVitals = !latestVitals;
  const baselineVitals = {
    hr: 78,
    spo2: 98,
    bp_sys: 110,
    bp_dia: 72,
    hrv: 70,
    skinTemp: 36.5,
  };
  const displayVitals = {
    hr: latestVitals?.hr ?? baselineVitals.hr,
    spo2: latestVitals?.spo2 ?? baselineVitals.spo2,
    bp_sys: latestVitals?.bp_sys ?? baselineVitals.bp_sys,
    bp_dia: latestVitals?.bp_dia ?? baselineVitals.bp_dia,
    hrv: latestVitals?.hrv ?? baselineVitals.hrv,
    skinTemp: latestVitals?.skinTemp ?? baselineVitals.skinTemp,
    timestamp: latestVitals?.timestamp,
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.heroCard}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>Hello, {patientProfile?.name || 'Super Mama'}!</Text>
          <Text style={styles.heroSubtitle}>We're cheering for you and baby every step of the way.</Text>
          <Text style={styles.heroCaption}>Track your journey, vitals, and upcoming visits below.</Text>
        </View>
        <View style={styles.heroBadge}>
          <Text style={styles.heroIcon}>LB</Text>
        </View>
      </View>

      <View style={[styles.card, styles.cardJourney]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderContent}>
            <Text style={styles.cardEmoji}>PJ</Text>
            <View style={styles.cardHeaderTextBlock}>
              <Text style={styles.cardTitle}>Pregnancy Journey</Text>
              <Text style={styles.cardSubtitle}>
                {preg ? 'Track your beautiful journey' : 'Add your LMP or EDD to personalise insights.'}
              </Text>
            </View>
          </View>
        </View>
        {preg ? (
          <View style={styles.journeyTilesWrap}>
            <JourneyStatCard value={currentWeekLabel} label="Weeks" caption={trimesterLabel} />
            <JourneyStatCard
              value={daysRemainingLabel}
              label="Days Left"
              caption="Almost there!"
              valueColor={colors.secondary}
            />
            <JourneyStatCard
              value={weightGainSample}
              label="kg Gained"
              caption="Healthy range"
              valueColor={colors.accent}
            />
          </View>
        ) : (
          <Text style={styles.cardCopy}>Head to your profile to add your LMP or EDD so we can map each week for you.</Text>
        )}
      </View>

      <View style={[styles.card, styles.cardMint]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Vitals Overview</Text>
            <Text style={styles.cardSubtitle}>Pulse, oxygen, and pressure at a glance</Text>
          </View>
        </View>
        <View style={styles.vitalsPanelRow}>
          <View style={styles.vitalsPanel}>
            <Text style={styles.vitalsPanelHeading}>Heart Rate</Text>
            <Text style={styles.vitalsPanelValue}>{displayVitals.hr} bpm</Text>
            <View style={styles.vitalsDivider} />
            <Text style={styles.vitalsPanelHeading}>SpO₂</Text>
            <Text style={styles.vitalsPanelValue}>{displayVitals.spo2}%</Text>
          </View>
          <View style={[styles.vitalsPanel, styles.vitalsPanelAccent]}>
            <Text style={styles.vitalsPanelHeading}>Blood Pressure</Text>
            <Text style={styles.vitalsPanelValue}>
              {displayVitals.bp_sys}/{displayVitals.bp_dia} mmHg
            </Text>
            <Text style={styles.vitalsPanelHint}>Systolic / Diastolic</Text>
          </View>
          <View style={[styles.vitalsPanel, styles.vitalsPanelSoft]}>
            <Text style={styles.vitalsPanelHeading}>HRV</Text>
            <Text style={styles.vitalsPanelValue}>{displayVitals.hrv} ms</Text>
            <View style={styles.vitalsDivider} />
            <Text style={styles.vitalsPanelHeading}>Skin Temp</Text>
            <Text style={styles.vitalsPanelValue}>{displayVitals.skinTemp} °C</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        <Text style={styles.meta}>
          {usingSampleVitals
            ? 'Showing reference values until your LifeBand shares live readings.'
            : `Last sync ${formatTime(displayVitals.timestamp)}`}
        </Text>
        <Button
          title="View History"
          variant="outline"
          onPress={() => navigation.navigate('VitalsHistory')}
          style={styles.historyButton}
        />
      </View>

      <TouchableOpacity
        style={[styles.card, styles.cardLavender]}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('AppointmentsCalendar')}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Appointments</Text>
          <Text style={styles.cardEmoji}>PJ</Text>
        </View>
        <Text style={styles.cardCopy}>Open your calendar to review upcoming visits and plan ahead.</Text>
        <Button
          title="View Checklist"
          variant="outline"
          onPress={() => navigation.navigate('PatientAppointments')}
          style={styles.buttonSpace}
        />
      </TouchableOpacity>
    </ScreenContainer>
  );
};

const JourneyStatCard: React.FC<{ value: string; label: string; caption: string; valueColor?: string }> = ({
  value,
  label,
  caption,
  valueColor,
}) => (
  <View style={styles.journeyStatCard}>
    <Text style={[styles.journeyValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    <Text style={styles.journeyLabel}>{label}</Text>
    <Text style={styles.journeyCaption}>{caption}</Text>
  </View>
);

const styles = StyleSheet.create({
  heroCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
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
    color: '#FDF0F0',
    marginBottom: spacing.xs,
    fontSize: typography.body,
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
    marginHorizontal: 0,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardJourney: {
    backgroundColor: '#FDECEE',
  },
  cardMint: {
    backgroundColor: '#E8F7F4',
  },
  cardLavender: {
    backgroundColor: '#EFE9FF',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  cardHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderTextBlock: {
    marginLeft: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  cardEmoji: {
    fontSize: 22,
  },
  cardCopy: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  journeyTilesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  journeyStatCard: {
    width: '31%',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.08)',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  journeyValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.healthy,
  },
  journeyLabel: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  journeyCaption: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  historyButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  vitalsPanelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  vitalsPanel: {
    width: '32%',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.12)',
  },
  vitalsPanelAccent: {
    backgroundColor: '#F1F3FF',
    borderColor: colors.secondary,
  },
  vitalsPanelSoft: {
    backgroundColor: '#F4FBF8',
    borderColor: 'rgba(77, 182, 172, 0.4)',
  },
  vitalsPanelHeading: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: '600',
  },
  vitalsPanelValue: {
    color: colors.textPrimary,
    fontSize: typography.subheading,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  vitalsPanelHint: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  vitalsDivider: {
    height: 1,
    backgroundColor: 'rgba(40, 53, 147, 0.1)',
    marginVertical: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  statusText: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  buttonSpace: {
    marginTop: spacing.sm,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.md,
    marginLeft: -spacing.xs,
  },
  navAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: spacing.xs,
  },
  navIcon: {
    fontSize: 18,
  },
  navSignOutAction: {
    backgroundColor: colors.primary,
  },
  navLabel: {
    color: colors.white,
    fontWeight: '600',
    fontSize: typography.small,
  },
});

export default PatientDashboardScreen;













