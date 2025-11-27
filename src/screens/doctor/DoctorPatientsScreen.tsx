import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth, firestore } from '../../services/firebase';
import { getDoctorPatients } from '../../services/doctorPatientService';
import { UserProfile } from '../../types/user';
import { doc, getDoc } from 'firebase/firestore';
import { calculatePregnancyProgress } from '../../utils/pregnancy';
import { onSnapshot, collection } from 'firebase/firestore';

const DoctorPatientsScreen: React.FC = () => {
  const uid = auth.currentUser?.uid;
  const [patients, setPatients] = useState<UserProfile[]>([]);

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

  return (
    <ScreenContainer>
      <Text style={styles.title}>My Patients</Text>
      <FlatList
        data={patients}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const preg = calculatePregnancyProgress(item.patientData);
          return (
            <View style={styles.card}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.email}</Text>
              <Text style={styles.meta}>
                {preg ? `Week ${preg.weeks}` : 'No pregnancy data'}
              </Text>
            </View>
          );
        }}
      />
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
  list: {
    paddingBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  name: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: typography.subheading,
  },
  meta: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});

export default DoctorPatientsScreen;
