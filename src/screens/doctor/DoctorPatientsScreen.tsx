import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View, TouchableOpacity, Linking } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth, firestore } from '../../services/firebase';
import { getDoctorPatients } from '../../services/doctorPatientService';
import { UserProfile } from '../../types/user';
import { doc, getDoc } from 'firebase/firestore';
import { calculatePregnancyProgress } from '../../utils/pregnancy';
import { onSnapshot, collection } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DoctorStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorPatients'>;

const DoctorPatientsScreen: React.FC<Props> = ({ navigation }) => {
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
      <View style={styles.header}>
        <Text style={styles.subtitle}>View and manage your patient list</Text>
      </View>
      <FlatList
        data={patients}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const preg = calculatePregnancyProgress(item.patientData);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('DoctorPatientDetail', { patientId: item.uid })}
              activeOpacity={0.7}
            >
              <View style={styles.patientHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name?.charAt(0) || 'P'}</Text>
                </View>
                <View style={styles.patientInfo}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.email}>📧 {item.email}</Text>
                  {item.phone && (
                    <View style={styles.phoneRow}>
                      <Text style={styles.phone}>📱 {item.phone}</Text>
                      <TouchableOpacity 
                        style={styles.callButton}
                        onPress={() => Linking.openURL(`tel:${item.phone}`)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.callIcon}>📞</Text>
                        <Text style={styles.callText}>Call</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
              {preg && (
                <View style={styles.pregnancyCard}>
                  <Text style={styles.pregnancyLabel}>🤰 Pregnancy Progress</Text>
                  <Text style={styles.pregnancyValue}>Week {preg.weeks} • Month {preg.months}</Text>
                </View>
              )}
              {!preg && (
                <Text style={styles.noData}>No pregnancy data available</Text>
              )}
              <View style={styles.viewDetailsHint}>
                <Text style={styles.viewDetailsText}>Tap to view vitals →</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No patients linked yet</Text>
            <Text style={styles.emptyHint}>Patients will appear here once they connect</Text>
          </View>
        }
      />
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
  list: {
    paddingBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  patientInfo: {
    flex: 1,
  },
  name: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: typography.subheading,
    marginBottom: spacing.xs - 2,
  },
  email: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: '500',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs - 2,
    gap: spacing.sm,
  },
  phone: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: '500',
    flex: 1,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.xs - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    gap: 4,
  },
  callIcon: {
    fontSize: 14,
  },
  callText: {
    color: colors.white,
    fontSize: typography.small - 1,
    fontWeight: '700',
  },
  pregnancyCard: {
    backgroundColor: '#F0F4FF',
    padding: spacing.md,
    borderRadius: radii.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  pregnancyLabel: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs - 2,
  },
  pregnancyValue: {
    fontSize: typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  noData: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  viewDetailsHint: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: typography.small,
    color: colors.accent,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl + spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default DoctorPatientsScreen;
