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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DoctorStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorCreateAppointment'>;

const DoctorCreateAppointmentScreen: React.FC<Props> = ({ navigation }) => {
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
      Alert.alert('Success', 'Appointment created successfully', [
        {
          text: 'OK',
          onPress: () => {
            setReason('');
            setDateValue(new Date());
            setSelectedPatient(null);
            navigation.navigate('DoctorAppointments');
          }
        }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not create appointment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Schedule a new consultation</Text>
      </View>
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
    fontSize: typography.small + 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  patientRow: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  patientChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#F8F9FA',
    borderWidth: 1.5,
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
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  patientText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: typography.small + 1,
  },
  patientTextActive: {
    color: colors.white,
    fontWeight: '700',
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
    marginBottom: spacing.xl + spacing.lg,
    color: colors.textPrimary,
    fontSize: typography.body,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  meta: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: typography.small,
    fontStyle: 'italic',
  },
});

export default DoctorCreateAppointmentScreen;
