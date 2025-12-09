import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Linking } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { Appointment, RiskLevel, ReportMeta } from '../../types/appointment';
import { getAppointment, markAppointmentCompleted, cancelAppointment } from '../../services/appointmentService';
import { subscribeAppointmentReports, uploadReportFileSupabase } from '../../services/reportService';
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    if (!doctorId || !appointment?.patientId) {
      setUploadError('Missing doctor or patient.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const res = await uploadReportFileSupabase(doctorId, appointment.patientId, appointmentId);
      if (!res) {
        setUploadError('Upload canceled.');
      }
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
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
      <View style={styles.header}>
        <Text style={styles.subtitle}>Review consultation details</Text>
      </View>
      
      <View style={[styles.card, styles.patientCard]}>
        <View style={styles.patientHeader}>
          <View style={styles.patientAvatar}>
            <Text style={styles.avatarText}>{patient?.name?.charAt(0) || 'P'}</Text>
          </View>
          <View style={styles.patientInfo}>
            <Text style={styles.patientName}>{patient?.name || 'Patient'}</Text>
            <Text style={styles.pregnancyBadge}>
              {preg ? `Week ${preg.weeks} • Month ${preg.months}` : 'No pregnancy data'}
            </Text>
            {patient?.phone && (
              <View style={styles.contactRow}>
                <Text style={styles.contactText}>📱 {patient.phone}</Text>
                <TouchableOpacity 
                  style={styles.quickCallButton}
                  onPress={() => Linking.openURL(`tel:${patient.phone}`)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickCallIcon}>📞</Text>
                  <Text style={styles.quickCallText}>Quick Call</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.card, styles.detailsCard]}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📅</Text>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Date & Time</Text>
            <Text style={styles.detailValue}>{format(date, 'EEEE, MMM d, yyyy')}</Text>
            <Text style={styles.detailTime}>{format(date, 'h:mm a')}</Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📋</Text>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Reason</Text>
            <Text style={styles.detailValue}>{appointment.reason || 'General Consultation'}</Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>✓</Text>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={[styles.statusBadge, styles[`status_${appointment.status}`]]}>
              <Text style={styles.statusText}>{appointment.status}</Text>
            </View>
          </View>
        </View>
      </View>

      {appointment.status === 'upcoming' && (
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.secondary }]}>
          <Text style={styles.cardTitle}>📝 Visit Review</Text>
          <Text style={styles.meta}>Document your consultation findings</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter visit summary, observations, and recommendations..."
            multiline
            numberOfLines={4}
            value={summary}
            onChangeText={setSummary}
          />
          <Text style={styles.detailLabel}>Risk Assessment</Text>
          <View style={styles.riskRow}>
            {(['stable', 'needs_attention', 'critical'] as RiskLevel[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.riskChip, risk === r && styles.riskChipActive]}
                onPress={() => setRisk(r)}
              >
                <Text style={[styles.riskText, risk === r && styles.riskTextActive]}>
                  {r.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Button title="✓ Mark as Completed & Save" onPress={handleComplete} style={{ marginBottom: spacing.sm }} />
          <Button title="Cancel Appointment" variant="outline" onPress={() => cancelAppointment(appointmentId)} />
        </View>
      )}

      <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#FFC107' }]}>
        <Text style={styles.cardTitle}>📄 Medical Reports</Text>
        <Text style={styles.meta}>Upload and manage patient documents</Text>
        <Button 
          title={uploading ? '⏳ Uploading...' : '+ Add Report (PDF/Image)'} 
          variant="outline" 
          onPress={handleUpload}
          disabled={uploading}
          style={{ marginTop: spacing.md, marginBottom: spacing.sm }}
        />
        {uploadError ? (
          <View style={{ backgroundColor: 'rgba(211, 47, 47, 0.1)', padding: spacing.sm, borderRadius: radii.md, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.critical, fontSize: typography.small }}>⚠️ {uploadError}</Text>
          </View>
        ) : null}
        {reports.map((r, index) => (
          <TouchableOpacity 
            key={r.id} 
            style={[styles.reportRow, index === 0 && { marginTop: spacing.md }]} 
            onPress={() => Linking.openURL(r.fileUrl)}
            activeOpacity={0.7}
          >
            <Text style={[styles.meta, { color: colors.textPrimary, fontWeight: '600', marginTop: 0 }]}>
              📎 {r.fileName}
            </Text>
            <Text style={[styles.meta, { fontSize: typography.small - 1, marginTop: 2 }]}>
              Tap to view
            </Text>
          </TouchableOpacity>
        ))}
        {reports.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.xs }}>📭</Text>
            <Text style={styles.meta}>No reports uploaded yet</Text>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  patientCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  pregnancyBadge: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  contactText: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  quickCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    gap: 4,
  },
  quickCallIcon: {
    fontSize: 14,
  },
  quickCallText: {
    color: colors.white,
    fontSize: typography.small - 1,
    fontWeight: '700',
  },
  detailsCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  detailIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: typography.small - 1,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  detailTime: {
    fontSize: typography.small,
    color: colors.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.xs - 2,
  },
  status_upcoming: {
    backgroundColor: colors.accent,
  },
  status_completed: {
    backgroundColor: colors.healthy,
  },
  status_cancelled: {
    backgroundColor: colors.critical,
  },
  statusText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.small - 1,
    textTransform: 'capitalize',
  },
  cardTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontSize: typography.subheading,
  },
  meta: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: typography.small,
  },
  input: {
    borderWidth: 2,
    borderColor: '#E9ECEF',
    borderRadius: radii.lg,
    padding: spacing.md,
    minHeight: 100,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.body,
    backgroundColor: colors.white,
    textAlignVertical: 'top',
  },
  riskRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  riskChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#F8F9FA',
    borderWidth: 1.5,
    borderColor: '#E9ECEF',
  },
  riskChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  riskText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  riskTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  reportRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    marginTop: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
});

export default DoctorAppointmentDetailScreen;
