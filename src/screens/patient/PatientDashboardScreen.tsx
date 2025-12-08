import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
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
import { collection, doc, onSnapshot } from 'firebase/firestore';
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
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOutUser();
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Please try again.';
              Alert.alert('Sign out failed', message);
            }
          },
        },
      ],
    );
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
          <TouchableOpacity style={styles.navActionButton} onPress={handleDoctorIconPress}>
            <Image 
              source={require('../../../assets/DoctorExchangeNavbar.png')} 
              style={styles.navDoctorImage}
              resizeMode="contain"
            />
            <Text style={styles.navActionLabel}>Exchange</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navActionButton} onPress={() => navigation.navigate('LifeBand')}>
            <Image 
              source={require('../../../assets/WatchNavbar.png')} 
              style={styles.navImage}
              resizeMode="contain"
            />
            <Text style={styles.navActionLabel}>Connect</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navSignOutAction} onPress={handleSignOut}>
            <Image 
              source={require('../../../assets/Logout.png')} 
              style={styles.navLogoutImage}
              resizeMode="contain"
            />
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
    hr: 0,
    spo2: 0,
    bp_sys:0,
    bp_dia: 0,
    hrv: 0,
    ptt: 0,
    ecg: 0,
    maternal_health_score: 100,
    anemia_risk: 'Low',
    preeclampsia_risk: 'Low',
    rhythm: 'Normal',
    arrhythmia_alert: false,
    anemia_alert: false,
    preeclampsia_alert: false,
  };
  const displayVitals = {
    hr: latestVitals?.hr ?? 0,
    spo2: latestVitals?.spo2 ?? 0,
    bp_sys: latestVitals?.bp_sys ?? 0,
    bp_dia: latestVitals?.bp_dia ?? 0,
    hrv: latestVitals?.hrv ?? latestVitals?.hrv_sdnn ?? 0,
    ptt: latestVitals?.ptt ?? 0,
    ecg: latestVitals?.ecg ?? 0,
    maternal_health_score: latestVitals?.maternal_health_score ?? 0,
    anemia_risk: latestVitals?.anemia_risk ?? 'Low',
    preeclampsia_risk: latestVitals?.preeclampsia_risk ?? 'Low',
    rhythm: latestVitals?.rhythm ?? 'Normal',
    arrhythmia_alert: latestVitals?.arrhythmia_alert ?? false,
    anemia_alert: latestVitals?.anemia_alert ?? false,
    preeclampsia_alert: latestVitals?.preeclampsia_alert ?? false,
    // Edge AI confidence scores
    rhythm_confidence: latestVitals?.rhythm_confidence ?? 0,
    anemia_confidence: latestVitals?.anemia_confidence ?? 0,
    preeclampsia_confidence: latestVitals?.preeclampsia_confidence ?? 0,
    timestamp: latestVitals?.timestamp,
  };

  // Convert risk text to percentage for display
  const getRiskPercentage = (riskLevel: string, confidence: number) => {
    if (confidence > 0) return confidence;
    // Fallback: estimate from risk level text
    const level = riskLevel?.toLowerCase() || 'low';
    if (level.includes('critical')) return 85;
    if (level.includes('high')) return 65;
    if (level.includes('moderate')) return 45;
    if (level.includes('low')) return 20;
    return 0;
  };

  // Get IST time-based greeting
  const getGreeting = () => {
    const now = new Date();
    const hour = now.getHours();
    
    if (hour >= 5 && hour < 12) {
      return {
        greeting: 'Good Morning',
        subtitle: "Start your day with positivity for you and your baby.",
        caption: "Track your morning vitals and plan your day ahead."
      };
    } else if (hour >= 12 && hour < 17) {
      return {
        greeting: 'Good Afternoon',
        subtitle: "Hope you're having a wonderful day with your little one.",
        caption: "Check your vitals and stay hydrated throughout the day."
      };
    } else if (hour >= 17 && hour < 21) {
      return {
        greeting: 'Good Evening',
        subtitle: "Winding down? We're here for you and baby every moment.",
        caption: "Review your day's vitals and prepare for a restful night."
      };
    } else {
      return {
        greeting: 'Good Night',
        subtitle: "Rest well, Kanna. Tomorrow brings new joy for you both.",
        caption: "Sweet dreams! Your wellness journey continues tomorrow."
      };
    }
  };

  const { greeting, subtitle, caption } = getGreeting();

  return (
    <>
      <ScreenContainer scrollable>
        <View style={styles.heroCard}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>{greeting}, {patientProfile?.name || 'Super Mama'}!</Text>
          <Text style={styles.heroSubtitle}>{subtitle}</Text>
          <Text style={styles.heroCaption}>{caption}</Text>
        </View>
        <View style={styles.heroBadge}>
          {patientProfile?.photoURL ? (
            <Image 
              source={{ uri: patientProfile.photoURL }} 
              style={styles.heroProfileImage}
              resizeMode="cover"
            />
          ) : (
            <Image 
              source={require('../../../assets/Patientprofile.jpg')} 
              style={styles.heroProfileImage}
              resizeMode="cover"
            />
          )}
        </View>
      </View>

      <View style={[styles.card, styles.cardJourney]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderContent}>
            <Image 
              source={require('../../../assets/Pregnancy.png')} 
              style={styles.cardPregnancyImage}
              resizeMode="contain"
            />
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
            <Text style={styles.cardTitle}>Real-Time Vitals</Text>
            <Text style={styles.cardSubtitle}>Live monitoring from your LifeBand</Text>
          </View>
          <View style={styles.edgeAiBadge}>
            <Text style={styles.edgeAiText}>🤖 Edge AI</Text>
          </View>
        </View>

        {/* Primary Vitals Row: HR & SpO2 */}
        <View style={styles.vitalsRow}>
          <View style={styles.vitalTilePrimary}>
            <Text style={styles.vitalLabel}>Heart Rate</Text>
            <Text style={styles.vitalValueLarge}>{displayVitals.hr}</Text>
            <Text style={styles.vitalUnit}>bpm</Text>
          </View>
          <View style={[styles.vitalTilePrimary, styles.vitalTileBlue]}>
            <Text style={styles.vitalLabel}>SpO₂</Text>
            <Text style={styles.vitalValueLarge}>{displayVitals.spo2}</Text>
            <Text style={styles.vitalUnit}>%</Text>
          </View>
        </View>

        {/* Blood Pressure Row */}
        <View style={styles.vitalsRow}>
          <View style={styles.vitalTileSecondary}>
            <Text style={styles.vitalLabel}>Blood Pressure</Text>
            <Text style={styles.vitalValueMedium}>{displayVitals.bp_sys}/{displayVitals.bp_dia}</Text>
            <Text style={styles.vitalUnit}>mmHg</Text>
          </View>
        </View>

        {/* Advanced Metrics Row: HRV & PTT (smaller, side by side) */}
        <View style={styles.vitalsRow}>
          <View style={styles.vitalTileCompact}>
            <Text style={styles.vitalLabelSmall}>HRV</Text>
            <Text style={styles.vitalValueSmall}>{displayVitals.hrv}</Text>
            <Text style={styles.vitalUnitSmall}>ms</Text>
          </View>
          <View style={[styles.vitalTileCompact, styles.vitalTileAmber]}>
            <Text style={styles.vitalLabelSmall}>PTT</Text>
            <Text style={styles.vitalValueSmall}>{displayVitals.ptt}</Text>
            <Text style={styles.vitalUnitSmall}>ms</Text>
          </View>
        </View>

        {/* ECG Raw Value (compact) */}
        <View style={styles.vitalsRow}>
          <View style={[styles.vitalTileCompact, styles.vitalTilePurple, { flex: 1 }]}>
            <Text style={styles.vitalLabelSmall}>ECG Signal</Text>
            <Text style={styles.vitalValueSmall}>{displayVitals.ecg}</Text>
            <Text style={styles.vitalUnitSmall}>raw</Text>
          </View>
        </View>

        {/* Health Alerts & Scores Row */}
        <View style={styles.healthMetricsRow}>
          <View style={styles.healthMetricTile}>
            <Text style={styles.healthMetricLabel}>Maternal Health</Text>
            <Text style={[styles.healthMetricScore, { color: displayVitals.maternal_health_score >= 80 ? colors.healthy : displayVitals.maternal_health_score >= 60 ? colors.attention : colors.muted }]}>
              {displayVitals.maternal_health_score}%
            </Text>
          </View>
          <View style={styles.healthMetricTile}>
            <Text style={styles.healthMetricLabel}>Rhythm</Text>
            <Text style={[styles.healthMetricValue, { color: displayVitals.arrhythmia_alert ? colors.muted : colors.healthy }]}>
              {displayVitals.rhythm}
            </Text>
            <Text style={styles.confidenceText}>
              {displayVitals.rhythm_confidence > 0 ? `${displayVitals.rhythm_confidence}%` : 'AI Active'}
            </Text>
          </View>
        </View>

        {/* Edge AI Risk Assessment Row */}
        <View style={styles.riskRow}>
          <View style={[styles.riskTile, displayVitals.anemia_alert && styles.riskAlert]}>
            <Text style={styles.riskLabel}>Anemia Risk</Text>
            <Text style={[styles.healthMetricScore, { color: getRiskPercentage(displayVitals.anemia_risk, displayVitals.anemia_confidence) >= 70 ? colors.muted : getRiskPercentage(displayVitals.anemia_risk, displayVitals.anemia_confidence) >= 40 ? colors.attention : colors.healthy }]}>
              {getRiskPercentage(displayVitals.anemia_risk, displayVitals.anemia_confidence)}%
            </Text>
            <Text style={styles.confidenceText}>
              {displayVitals.anemia_risk}
            </Text>
          </View>
          <View style={[styles.riskTile, displayVitals.preeclampsia_alert && styles.riskAlert]}>
            <Text style={styles.riskLabel}>Preeclampsia Risk</Text>
            <Text style={[styles.healthMetricScore, { color: getRiskPercentage(displayVitals.preeclampsia_risk, displayVitals.preeclampsia_confidence) >= 70 ? colors.muted : getRiskPercentage(displayVitals.preeclampsia_risk, displayVitals.preeclampsia_confidence) >= 40 ? colors.attention : colors.healthy }]}>
              {getRiskPercentage(displayVitals.preeclampsia_risk, displayVitals.preeclampsia_confidence)}%
            </Text>
            <Text style={styles.confidenceText}>
              {displayVitals.preeclampsia_risk}
            </Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        <Text style={styles.meta}>
          {usingSampleVitals
            ? 'Connect your LifeBand to see live vitals.'
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

      <View style={styles.bottomSpacer} />
    </ScreenContainer>
    
    <View style={styles.bottomCardContainer}>
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('MeditronChat')}
      >
        <Image 
          source={require('../../../assets/Chatbot.png')} 
          style={styles.fabImage}
          resizeMode="contain"
        />
        <Text style={styles.fabLabel}>AI Chat</Text>
      </TouchableOpacity>
    </View>
    </>
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
    marginHorizontal: 8,
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
    overflow: 'hidden',
  },
  heroProfileImage: {
    width: 64,
    height: 74,
  },
  heroIcon: {
    fontSize: 28,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 10,
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
  edgeAiBadge: {
    backgroundColor: 'rgba(40, 53, 147, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  edgeAiText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
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
  cardPregnancyImage: {
    width: 32,
    height: 32,
    transform: [{ scale: 4.8}],  // adjust zoom as needed
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
  vitalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  vitalTilePrimary: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitalTileBlue: {
    backgroundColor: colors.white,
    borderColor: colors.secondary,
  },
  vitalTileSecondary: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitalTileGreen: {
    backgroundColor: colors.white,
    borderColor: colors.healthy,
  },
  vitalTileCompact: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitalTilePurple: {
    backgroundColor: colors.white,
    borderColor: colors.accent,
  },
  vitalTileAmber: {
    backgroundColor: colors.white,
    borderColor: colors.attention,
  },
  vitalLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  vitalLabelSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  vitalValueLarge: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  vitalValueMedium: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  vitalValueSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  vitalUnit: {
    fontSize: typography.small,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  vitalUnitSmall: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  healthMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  healthMetricTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.1)',
    alignItems: 'center',
  },
  healthMetricLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  healthMetricScore: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.healthy,
  },
  healthMetricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  riskTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(40, 53, 147, 0.1)',
    alignItems: 'center',
  },
  riskAlert: {
    backgroundColor: '#FFEBEE',
    borderColor: colors.muted,
    borderWidth: 1.5,
  },
  riskLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  riskValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.healthy,
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
  bottomSpacer: {
    height: 80,
  },
  bottomCardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: colors.white,
    borderTopLeftRadius: 100,
    borderTopRightRadius: 100,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopColor: colors.secondary,
    borderLeftColor: colors.secondary,
    borderRightColor: colors.secondary,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  fab: {
    position: 'absolute',
    top: -32,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff0caeff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 12,
  },
  fabIcon: {
    fontSize: 28,
    color: colors.white,
  },
  fabLabel: {
    marginTop: 2,
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.white,
  },
  buttonSpace: {
    marginTop: spacing.sm,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    gap: 1,
  },
  navActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.card,
    paddingVertical: 1,
    paddingHorizontal: 2,
  },
  navAction: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  navIcon: {
    fontSize: 24,
  },
  navActionLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  navSignOutAction: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    marginLeft: 0.5,
  },
  navLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.small,
  },
  navLogoutImage: {
    width: 24,
    height: 24,
    transform: [{ scale: 1.8 }],  // adjust zoom as needed
  },
  fabImage: {
  width: 46,
  height: 36,
  transform: [{ scale: 1.9 }],  // zoom 40%
},
  navImage: {
    width: 24,
    height: 24,
    transform: [{ scale: 1.7 }],  // zoom 40%
  },
  navDoctorImage: {
    width: 24,
    height: 24,
    transform: [{ scale: 2.2 }],  // adjust zoom as needed
    marginRight: spacing.sm,
  },
});

export default PatientDashboardScreen;

















