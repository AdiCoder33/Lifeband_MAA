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
  if (!timestamp) return '—';
  const asMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
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
            <Text style={styles.navIcon}>🩺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navAction} onPress={() => navigation.navigate('LifeBand')}>
            <Text style={styles.navIcon}>📡</Text>
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
  const currentWeekLabel = pregnancyWeek !== null ? `${pregnancyWeek}` : '—';
  const daysRemainingLabel =
    daysRemaining !== null && daysRemaining !== undefined ? `${daysRemaining}` : '—';
  const trimesterLabel = pregnancyWeek
    ? pregnancyWeek <= 13
      ? '1st Trimester'
      : pregnancyWeek <= 27
      ? '2nd Trimester'
      : '3rd Trimester'
    : '—';
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

  const resolvedTimestamp =
    latestVitals && typeof latestVitals.lastSampleTimestamp === 'number'
      ? latestVitals.lastSampleTimestamp
      : latestVitals?.timestamp ?? null;

  // Check if we have received real vitals data (timestamp > 0 means real data from ESP32)
  const hasRealData = typeof resolvedTimestamp === 'number' && resolvedTimestamp > 0;
  const usingSampleVitals = !hasRealData;
  
  const displayVitals = {
    hr: latestVitals?.hr ?? null,
    spo2: latestVitals?.spo2 ?? null,
    bp_sys: latestVitals?.bp_sys ?? null,
    bp_dia: latestVitals?.bp_dia ?? null,
    hrv: latestVitals?.hrv ?? null,
    ptt: latestVitals?.ptt ?? null,
    ecg: latestVitals?.ecg ?? null,
    ir: latestVitals?.ir ?? null,
    timestamp: resolvedTimestamp,
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
          <Text style={styles.heroIcon}>🤰</Text>
        </View>
      </View>

      {/* AI Health Insights - Show when connected with data */}
      {hasRealData && latestVitals && (latestVitals.maternal_health_score !== undefined || latestVitals.rhythm || latestVitals.anemia_risk || latestVitals.preeclampsia_risk) && (
        <View style={[styles.card, styles.cardHealth]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderContent}>
              <Text style={styles.cardEmoji}>🧠</Text>
              <View style={styles.cardHeaderTextBlock}>
                <Text style={styles.cardTitle}>AI Health Insights</Text>
                <Text style={styles.cardSubtitle}>Real-time maternal health monitoring</Text>
              </View>
            </View>
          </View>
          
          {latestVitals.maternal_health_score !== undefined && (
            <View style={styles.healthScorePanel}>
              <Text style={styles.healthScoreLabel}>Maternal Health Score</Text>
              <Text style={[
                styles.healthScoreValue,
                { color: latestVitals.maternal_health_score >= 80 ? colors.healthy : 
                         latestVitals.maternal_health_score >= 60 ? colors.attention : 
                         colors.critical }
              ]}>
                {latestVitals.maternal_health_score}/100
              </Text>
              <Text style={styles.healthScoreHint}>
                {latestVitals.maternal_health_score >= 80 ? 'Excellent health indicators' :
                 latestVitals.maternal_health_score >= 60 ? 'Monitor regularly' :
                 'Consult your doctor'}
              </Text>
            </View>
          )}

          <View style={styles.aiInsightsRow}>
            {latestVitals.rhythm && (
              <View style={styles.aiInsightTile}>
                <Text style={styles.aiInsightLabel}>Heart Rhythm</Text>
                <Text style={[
                  styles.aiInsightValue,
                  { color: latestVitals.rhythm === 'Normal' ? colors.healthy : colors.attention }
                ]}>
                  {latestVitals.rhythm}
                </Text>
                {latestVitals.rhythm_confidence !== undefined && (
                  <Text style={styles.aiInsightMeta}>{String(latestVitals.rhythm_confidence)}% confidence</Text>
                )}
              </View>
            )}
            
            {latestVitals.anemia_risk && (
              <View style={styles.aiInsightTile}>
                <Text style={styles.aiInsightLabel}>Anemia Risk</Text>
                <Text style={[
                  styles.aiInsightValue,
                  { color: latestVitals.anemia_risk === 'Low' ? colors.healthy : 
                           latestVitals.anemia_risk.includes('Moderate') ? colors.attention : 
                           colors.critical }
                ]}>
                  {latestVitals.anemia_risk}
                </Text>
                {latestVitals.anemia_confidence !== undefined && (
                  <Text style={styles.aiInsightMeta}>{String(latestVitals.anemia_confidence)}% confidence</Text>
                )}
              </View>
            )}
            
            {latestVitals.preeclampsia_risk && (
              <View style={styles.aiInsightTile}>
                <Text style={styles.aiInsightLabel}>Preeclampsia Risk</Text>
                <Text style={[
                  styles.aiInsightValue,
                  { color: latestVitals.preeclampsia_risk === 'Low' ? colors.healthy : 
                           latestVitals.preeclampsia_risk.includes('Moderate') ? colors.attention : 
                           colors.critical }
                ]}>
                  {latestVitals.preeclampsia_risk}
                </Text>
                {latestVitals.preeclampsia_confidence !== undefined && (
                  <Text style={styles.aiInsightMeta}>{String(latestVitals.preeclampsia_confidence)}% confidence</Text>
                )}
              </View>
            )}
          </View>
          
          {(latestVitals.hr_source || latestVitals.bp_method) && (
            <View style={styles.signalQualityRow}>
              {latestVitals.hr_source && (
                <Text style={styles.signalQualityText}>HR Source: {latestVitals.hr_source}</Text>
              )}
              {latestVitals.bp_method && (
                <Text style={styles.signalQualityText}>BP Method: {latestVitals.bp_method}</Text>
              )}
              {latestVitals.ecg_quality !== undefined && (
                <Text style={styles.signalQualityText}>ECG Quality: {String(latestVitals.ecg_quality)}%</Text>
              )}
              {latestVitals.ppg_quality !== undefined && (
                <Text style={styles.signalQualityText}>PPG Quality: {String(latestVitals.ppg_quality)}%</Text>
              )}
            </View>
          )}
        </View>
      )}

      <View style={[styles.card, styles.cardJourney]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderContent}>
            <Text style={styles.cardEmoji}>🤰</Text>
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
            {displayVitals.hr !== null ? (
              <Text style={styles.vitalsPanelValue}>{displayVitals.hr} bpm</Text>
            ) : (
              <Text style={styles.vitalsPanelValueNull}>--</Text>
            )}
            <View style={styles.vitalsDivider} />
            <Text style={styles.vitalsPanelHeading}>SpO₂</Text>
            {displayVitals.spo2 !== null ? (
              <Text style={styles.vitalsPanelValue}>{displayVitals.spo2}%</Text>
            ) : (
              <Text style={styles.vitalsPanelValueNull}>--</Text>
            )}
          </View>
          <View style={[styles.vitalsPanel, styles.vitalsPanelAccent]}>
            <Text style={styles.vitalsPanelHeading}>Blood Pressure</Text>
            {displayVitals.bp_sys !== null && displayVitals.bp_dia !== null ? (
              <Text style={styles.vitalsPanelValue}>
                {displayVitals.bp_sys}/{displayVitals.bp_dia} mmHg
              </Text>
            ) : (
              <Text style={styles.vitalsPanelValueNull}>--/--</Text>
            )}
            <Text style={styles.vitalsPanelHint}>Systolic / Diastolic</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>
            {lifeBandState.connectionState === 'connected'
              ? hasRealData
                ? 'Live monitoring active'
                : 'Connected - waiting for data...'
              : statusLabel}
          </Text>
        </View>
        {lifeBandState.connectionState === 'connected' && !hasRealData && (
          <View style={styles.waitingBox}>
            <Text style={styles.waitingText}>📡 Waiting for LifeBand to send vitals data...</Text>
          </View>
        )}
        {lifeBandState.connectionState !== 'connected' && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>Connect your LifeBand to see live readings.</Text>
          </View>
        )}
        {latestVitals && hasRealData && (
          <View style={styles.sensorRow}>
            {typeof displayVitals.hrv === 'number' && (
              <View style={styles.sensorTile}>
                <Text style={styles.sensorLabel}>HRV</Text>
                <Text style={styles.sensorValue}>{Math.round(displayVitals.hrv)} ms</Text>
              </View>
            )}
            {typeof displayVitals.ptt === 'number' && (
              <View style={styles.sensorTile}>
                <Text style={styles.sensorLabel}>PTT</Text>
                <Text style={styles.sensorValue}>{displayVitals.ptt.toFixed(1)} ms</Text>
              </View>
            )}
            {typeof displayVitals.ecg === 'number' && (
              <View style={styles.sensorTile}>
                <Text style={styles.sensorLabel}>ECG</Text>
                <Text style={styles.sensorValue}>{Math.round(displayVitals.ecg)}</Text>
              </View>
            )}
            {typeof displayVitals.ir === 'number' && (
              <View style={styles.sensorTile}>
                <Text style={styles.sensorLabel}>PPG IR</Text>
                <Text style={styles.sensorValue}>{Math.round(displayVitals.ir)}</Text>
              </View>
            )}
          </View>
        )}
        <Text style={styles.meta}>
          {usingSampleVitals
            ? 'Waiting for vitals data from LifeBand...'
            : `Last sync ${formatTime(displayVitals.timestamp ?? undefined)}`}
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
          <Text style={styles.cardEmoji}>📅</Text>
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
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  vitalsPanel: {
    width: '48%',
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
  vitalsPanelValueNull: {
    color: colors.textSecondary,
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
  waitingBox: {
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  waitingText: {
    fontSize: typography.body,
    color: '#92400E',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#E0F2FE',
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  infoText: {
    fontSize: typography.body,
    color: '#0C4A6E',
    textAlign: 'center',
  },
  sensorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  sensorTile: {
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.12)',
    minWidth: 70,
  },
  sensorLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  sensorValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
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
  // Alert Card Styles
  alertCard: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
    borderWidth: 2,
    marginHorizontal: 0,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  alertIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  alertTitle: {
    fontSize: typography.subheading,
    fontWeight: '800',
    color: '#991B1B',
  },
  alertItem: {
    marginBottom: spacing.sm,
  },
  alertLabel: {
    fontSize: typography.body,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  alertValue: {
    fontSize: typography.small,
    color: '#991B1B',
    marginTop: 2,
  },
  alertFooter: {
    fontSize: typography.small,
    fontWeight: '600',
    color: '#991B1B',
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  // AI Health Insights Styles
  cardHealth: {
    backgroundColor: '#F0F9FF',
  },
  healthScorePanel: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.12)',
  },
  healthScoreLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  healthScoreValue: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  healthScoreHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  aiInsightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  aiInsightTile: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.12)',
  },
  aiInsightLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiInsightValue: {
    fontSize: typography.subheading,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  aiInsightMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  signalQualityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'rgba(40, 53, 147, 0.04)',
    borderRadius: radii.sm,
  },
  signalQualityText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});

export default PatientDashboardScreen;
