import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View, Alert, ScrollView, Dimensions } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { getAppointment } from '../../services/appointmentService';
import { subscribeAppointmentReports } from '../../services/reportService';
import { Appointment, ReportMeta } from '../../types/appointment';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PatientStackParamList } from '../../types/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../services/firebase';
import { UserProfile } from '../../types/user';
import { format } from 'date-fns';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type Props = NativeStackScreenProps<PatientStackParamList, 'PatientAppointmentDetail'>;

const PatientAppointmentDetailScreen: React.FC<Props> = ({ route }) => {
  const { appointmentId } = route.params;
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [doctor, setDoctor] = useState<UserProfile | null>(null);
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [processingReportId, setProcessingReportId] = useState<string | undefined>();

  useEffect(() => {
    const load = async () => {
      const appt = await getAppointment(appointmentId);
      setAppointment(appt);
      if (appt?.doctorId) {
        const snap = await getDoc(doc(firestore, 'users', appt.doctorId));
        if (snap.exists()) setDoctor(snap.data() as UserProfile);
      }
    };
    load();
    const unsub = subscribeAppointmentReports(appointmentId, setReports);
    return () => unsub();
  }, [appointmentId]);

  if (!appointment) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Loading...</Text>
      </ScreenContainer>
    );
  }

  const date = new Date((appointment.scheduledAt as any).toDate ? (appointment.scheduledAt as any).toDate() : appointment.scheduledAt);

  const triggerAnalysis = async (report: ReportMeta) => {
    if (!BACKEND_URL) {
      Alert.alert('AI Summary', 'Backend URL is not configured.');
      return;
    }
    try {
      setProcessingReportId(report.id);
      const resp = await fetch(`${BACKEND_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          reportId: report.id,
          fileUrl: report.fileUrl,
          mimeType: report.contentType || 'image/jpeg',
        }),
      });
      if (!resp.ok) throw new Error(`Backend returned ${resp.status}`);
    } catch (e: any) {
      console.error('AI summary trigger failed', e);
      Alert.alert('AI Summary', 'Failed to process this report. Please try again.');
    } finally {
      setProcessingReportId(undefined);
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.header}>
        <Text style={styles.title}>Appointment Details</Text>
        <Text style={styles.subtitle}>Review your appointment information</Text>
      </View>
      
      <View style={styles.doctorCard}>
        <View style={styles.doctorHeader}>
          <View style={styles.doctorAvatar}>
            <Text style={styles.doctorAvatarText}>{(doctor?.name || 'Dr').charAt(0)}</Text>
          </View>
          <View style={styles.doctorInfo}>
            <Text style={styles.doctorName}>{doctor?.name || 'Doctor'}</Text>
            <Text style={styles.hospitalName}>{doctor?.doctorData?.hospital || 'Hospital'}</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>📅 Appointment Details</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date & Time</Text>
          <Text style={styles.detailValue}>{format(date, 'PPP p')}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Reason</Text>
          <Text style={styles.detailValue}>{appointment.reason || 'Consultation'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Status</Text>
          <View style={[styles.statusBadge, styles[`status_${appointment.status}`]]}>
            <Text style={styles.statusText}>{appointment.status}</Text>
          </View>
        </View>
        {appointment.visitSummary ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Visit Summary</Text>
            <Text style={styles.summaryText}>{appointment.visitSummary}</Text>
          </View>
        ) : null}
      </View>
      
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>📄 Medical Reports</Text>
        </View>
        {reports.map((r) => (
          <View key={r.id} style={styles.reportBlock}>
            <TouchableOpacity style={styles.reportRow} onPress={() => Linking.openURL(r.fileUrl)}>
              <Text style={[styles.meta, styles.reportTitle]}>{r.fileName}</Text>
              <Text style={styles.meta}>Tap to view</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.aiButton}
              onPress={() => triggerAnalysis(r)}
              disabled={processingReportId === r.id}
            >
              <Text style={styles.aiButtonText}>
                {processingReportId === r.id ? 'Processing…' : 'Generate AI Summary'}
              </Text>
            </TouchableOpacity>
            {r.analysis?.summary ? (
              <View style={styles.analysisBox}>
                <Text style={styles.analysisLabel}>AI Summary</Text>
                <Text style={styles.analysisText}>{r.analysis.summary}</Text>
              </View>
            ) : null}
          </View>
        ))}
        {reports.length === 0 && <Text style={styles.meta}>No reports yet.</Text>}
      </View>
    </ScreenContainer>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = SCREEN_WIDTH < 375 ? spacing.md : spacing.lg;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: CARD_MARGIN,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: SCREEN_WIDTH < 375 ? typography.heading - 2 : typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  doctorCard: {
    backgroundColor: '#F5F8FF',
    marginHorizontal: CARD_MARGIN,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E3EBFF',
  },
  doctorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doctorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  doctorAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    fontSize: typography.body + 2,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hospitalName: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: CARD_MARGIN,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: typography.body + 1,
    color: colors.textPrimary,
  },
  detailRow: {
    marginBottom: spacing.md,
  },
  detailLabel: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.white,
  },
  status_scheduled: {
    backgroundColor: colors.accent,
  },
  status_completed: {
    backgroundColor: colors.healthy,
  },
  status_cancelled: {
    backgroundColor: colors.critical,
  },
  summaryBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#FFF9E6',
    borderRadius: radii.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.attention,
  },
  summaryLabel: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  summaryText: {
    fontSize: typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  meta: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  reportRow: {
    paddingVertical: spacing.xs,
  },
  reportBlock: {
    paddingVertical: spacing.xs,
  },
  reportTitle: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  analysisBox: {
    marginTop: spacing.xs,
    backgroundColor: '#F1F3FF',
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  aiButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  aiButtonText: {
    color: colors.white,
    fontWeight: '700',
  },
  analysisLabel: {
    fontWeight: '700',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  analysisText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});

export default PatientAppointmentDetailScreen;
