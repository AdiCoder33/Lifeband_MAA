import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
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
      <Text style={styles.title}>Appointment</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{doctor?.name || 'Doctor'}</Text>
        <Text style={styles.meta}>{doctor?.doctorData?.hospital}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Details</Text>
        <Text style={styles.meta}>{format(date, 'PPP p')}</Text>
        <Text style={styles.meta}>Reason: {appointment.reason || 'Consultation'}</Text>
        <Text style={styles.meta}>Status: {appointment.status}</Text>
        {appointment.visitSummary ? <Text style={styles.meta}>Summary: {appointment.visitSummary}</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reports</Text>
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
