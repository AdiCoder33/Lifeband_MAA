import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

type Props = NativeStackScreenProps<PatientStackParamList, 'PatientAppointmentDetail'>;

const PatientAppointmentDetailScreen: React.FC<Props> = ({ route }) => {
  const { appointmentId } = route.params;
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [doctor, setDoctor] = useState<UserProfile | null>(null);
  const [reports, setReports] = useState<ReportMeta[]>([]);

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
  reportRow: {
    paddingVertical: spacing.xs,
  },
});

export default PatientAppointmentDetailScreen;
