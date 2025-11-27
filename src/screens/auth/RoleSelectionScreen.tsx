import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { RootScreenProps } from '../../types/navigation';
import { createUserProfileFromAuth, getUserProfile } from '../../services/userService';
import { auth } from '../../services/firebase';
import { UserRole } from '../../types/user';

type Props = RootScreenProps<'RoleSelection'>;

const RoleSelectionScreen: React.FC<Props> = ({ navigation }) => {
  const [error, setError] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);
  const user = auth.currentUser;

  const handleSelect = async (role: UserRole) => {
    if (!user) {
      setError('No signed-in Google account found.');
      return;
    }
    try {
      setError(null);
      setLoadingRole(role);
      const existingProfile = await getUserProfile(user.uid);
      if (existingProfile) {
        if (existingProfile.role !== role) {
          setError(
            `This Google account is already registered as a ${existingProfile.role}. Please continue with that role.`,
          );
          return;
        }
        navigation.replace(
          existingProfile.role === 'patient' ? 'PatientOnboarding' : 'DoctorOnboarding',
          { profile: existingProfile },
        );
        return;
      }

      const profile = await createUserProfileFromAuth(user, role, { name: user.displayName || '' });
      navigation.replace(role === 'patient' ? 'PatientOnboarding' : 'DoctorOnboarding', {
        profile,
      });
    } catch (err) {
      console.error(err);
      setError('Unable to save your role. Please try again.');
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.container}>
        <Text style={styles.title}>
          Welcome{user?.displayName ? `, ${user.displayName}` : ''}!
        </Text>
        <Text style={styles.subtitle}>Choose the role that best describes you.</Text>

        <TouchableOpacity
          style={[styles.card, styles.patientCard]}
          onPress={() => handleSelect('patient')}
          disabled={loadingRole !== null}
        >
          <Text style={styles.cardTitle}>Pregnant Mother</Text>
          <Text style={styles.cardCopy}>Personalized maternal health guidance.</Text>
          {loadingRole === 'patient' ? <Text style={styles.cardLoading}>Saving...</Text> : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.doctorCard]}
          onPress={() => handleSelect('doctor')}
          disabled={loadingRole !== null}
        >
          <Text style={[styles.cardTitle, styles.cardTitleLight]}>Doctor</Text>
          <Text style={[styles.cardCopy, styles.cardCopyLight]}>
            Coordinate patient care and insights.
          </Text>
          {loadingRole === 'doctor' ? (
            <Text style={[styles.cardLoading, styles.cardCopyLight]}>Saving...</Text>
          ) : null}
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    fontSize: typography.body,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  patientCard: {
    backgroundColor: colors.primary,
  },
  doctorCard: {
    backgroundColor: colors.secondary,
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardCopy: {
    fontSize: typography.body,
    color: colors.textPrimary,
  },
  cardTitleLight: {
    color: colors.white,
  },
  cardCopyLight: {
    color: '#EDEDF9',
  },
  cardLoading: {
    marginTop: spacing.sm,
    fontWeight: '700',
  },
  error: {
    color: colors.critical,
    marginTop: spacing.sm,
  },
});

export default RoleSelectionScreen;
