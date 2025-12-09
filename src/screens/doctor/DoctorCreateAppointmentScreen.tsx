import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View, TextInput } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth, firestore } from '../../services/firebase';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile } from '../../types/user';
import { createAppointment } from '../../services/appointmentService';
import { format } from 'date-fns';

const DoctorCreateAppointmentScreen: React.FC = () => {
  const uid = auth.currentUser?.uid;
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<UserProfile | null>(null);
  const [dateValue, setDateValue] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(firestore, 'users', uid, 'patients'), async (snap) => {
      const profiles: UserProfile[] = [];
      for (const d of snap.docs) {
        const patientId = (d.data() as any).patientId;
        const psnap = await getDoc(doc(firestore, 'users', patientId));
        if (psnap.exists()) profiles.push(psnap.data() as UserProfile);
      }
      setPatients(profiles);
    });
    return () => unsub();
  }, [uid]);

  const handleCreate = async () => {
    if (!uid || !selectedPatient) {
      Alert.alert('Select patient', 'Please select a patient.');
      return;
    }
    try {
      setLoading(true);
      await createAppointment(uid, selectedPatient.uid, dateValue, reason || undefined);
      Alert.alert('Created', 'Appointment created.');
      setReason('');
      setDateValue(new Date());
      setSelectedPatient(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not create appointment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scrollable>
      <Text style={styles.title}>New Appointment</Text>
      <Text style={styles.label}>Select Patient</Text>
      <FlatList
        data={patients}
        keyExtractor={(item) => item.uid}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.patientRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.patientChip,
              selectedPatient?.uid === item.uid && styles.patientChipActive,
            ]}
            onPress={() => setSelectedPatient(item)}
          >
            <Text style={[styles.patientText, selectedPatient?.uid === item.uid && styles.patientTextActive]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.meta}>No linked patients yet.</Text>}
      />

      <Text style={styles.label}>Date & time</Text>
      <TouchableOpacity
        style={styles.inputButton}
        onPress={() => {
          setPickerMode('date');
          setShowPicker(true);
        }}
      >
        <Text style={styles.inputText}>{format(dateValue, 'PPP')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.inputButton}
        onPress={() => {
          setPickerMode('time');
          setShowPicker(true);
        }}
      >
        <Text style={styles.inputText}>{format(dateValue, 'HH:mm')}</Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={dateValue}
          mode={pickerMode}
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event: any, selectedDate?: Date) => {
            if (Platform.OS !== 'ios') setShowPicker(false);
            if (selectedDate) {
              setDateValue(selectedDate);
            }
          }}
        />
      )}

      <Text style={styles.label}>Reason (optional)</Text>
      <TextInput
        style={styles.inputBox}
        value={reason}
        onChangeText={setReason}
        placeholder="Consultation"
      />

      <Button title="Create Appointment" onPress={handleCreate} loading={loading} />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading + 2,
    fontWeight: '800',
    color: colors.secondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  label: {
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    fontSize: typography.body,
  },
  patientRow: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  patientChip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: '#F8F9FA',
    borderWidth: 2,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  patientChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
    shadowColor: colors.secondary,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  patientText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: typography.body,
  },
  patientTextActive: {
    color: colors.white,
  },
  inputButton: {
    borderWidth: 2,
    borderColor: '#E9ECEF',
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: typography.body,
  },
  inputBox: {
    borderWidth: 2,
    borderColor: '#E9ECEF',
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    color: colors.textPrimary,
    fontSize: typography.body,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  meta: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: typography.small,
    fontStyle: 'italic',
  },
});

export default DoctorCreateAppointmentScreen;
