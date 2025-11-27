import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Linking } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { Appointment, RiskLevel, ReportMeta } from '../../types/appointment';
import { getAppointment, markAppointmentCompleted, cancelAppointment } from '../../services/appointmentService';
import { subscribeAppointmentReports, uploadReportFile } from '../../services/reportService';
import { auth, firestore } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DoctorStackParamList } from '../../types/navigation';
import { calculatePregnancyProgress } from '../../utils/pregnancy';
import { UserProfile } from '../../types/user';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorAppointmentDetail'>;

const DoctorAppointmentDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { appointmentId } = route.params;
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState('');
  const [risk, setRisk] = useState<RiskLevel | undefined>();
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const doctorId = auth.currentUser?.uid;

  useEffect(() => {
    const load = async () => {
      const appt = await getAppointment(appointmentId);
      setAppointment(appt);
      if (appt?.patientId) {
        const snap = await getDoc(doc(firestore, 'users', appt.patientId));
        if (snap.exists()) setPatient(snap.data() as UserProfile);
      }
    };
    load();
    const unsub = subscribeAppointmentReports(appointmentId, setReports);
    return () => unsub();
  }, [appointmentId]);

  const handleComplete = async () => {
    if (!summary.trim()) return;
    await markAppointmentCompleted(appointmentId, summary.trim(), risk);
    navigation.goBack();
  };

  const handleUpload = async () => {
    if (!doctorId || !appointment?.patientId) return;
    await uploadReportFile(doctorId, appointment.patientId, appointmentId);
  };

  if (!appointment) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Loading...</Text>
      </ScreenContainer>
    );
  }

  const date = new Date((appointment.scheduledAt as any).toDate ? (appointment.scheduledAt as any).toDate() : appointment.scheduledAt);
  const preg = calculatePregnancyProgress(patient?.patientData);

  return (
    <ScreenContainer scrollable>
      <Text style={styles.title}>Appointment</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{patient?.name || 'Patient'}</Text>
        <Text style={styles.meta}>{preg ? `Week ${preg.weeks}` : 'No pregnancy data'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Details</Text>
        <Text style={styles.meta}>{format(date, 'PPP p')}</Text>
        <Text style={styles.meta}>Reason: {appointment.reason || 'Consultation'}</Text>
        <Text style={styles.meta}>Status: {appointment.status}</Text>
      </View>

      {appointment.status === 'upcoming' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Visit Review</Text>
          <TextInput
            style={styles.input}
            placeholder="Visit summary"
            multiline
            value={summary}
            onChangeText={setSummary}
          />
          <View style={styles.riskRow}>
            {(['stable', 'needs_attention', 'critical'] as RiskLevel[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.riskChip, risk === r && styles.riskChipActive]}
                onPress={() => setRisk(r)}
              >
                <Text style={[styles.riskText, risk === r && styles.riskTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Button title="Mark as Completed & Save" onPress={handleComplete} />
          <Button title="Cancel Appointment" variant="outline" onPress={() => cancelAppointment(appointmentId)} />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reports</Text>
        <Button title="Add Report (PDF/Image)" variant="outline" onPress={handleUpload} />
        {reports.map((r) => (
          <TouchableOpacity key={r.id} style={styles.reportRow} onPress={() => Linking.openURL(r.fileUrl)}>
            <Text style={styles.meta}>{r.fileName}</Text>
          </TouchableOpacity>
        ))}
        {reports.length === 0 && <Text style={styles.meta}>No reports yet.</Text>}
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
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  cardTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  meta: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 80,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  },
  riskRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  riskChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
  },
  riskChipActive: {
    backgroundColor: colors.secondary,
  },
  riskText: {
    color: colors.textPrimary,
  },
  riskTextActive: {
    color: colors.white,
  },
  reportRow: {
    paddingVertical: spacing.xs,
  },
});

export default DoctorAppointmentDetailScreen;
