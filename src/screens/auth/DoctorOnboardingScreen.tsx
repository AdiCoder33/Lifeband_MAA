import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from '../../components/Button';
import ScreenContainer from '../../components/ScreenContainer';
import TextInput from '../../components/TextInput';
import { RootScreenProps } from '../../types/navigation';
import { colors, spacing, typography } from '../../theme/theme';
import { auth } from '../../services/firebase';
import { getUserProfile, updateUserProfile } from '../../services/userService';
import { UserProfile } from '../../types/user';

type Props = RootScreenProps<'DoctorOnboarding'> & {
  profile?: UserProfile | null;
  onCompleted?: (profile: UserProfile) => void;
};

const DoctorOnboardingScreen: React.FC<Props> = ({ navigation, route, profile, onCompleted }) => {
  const preloadedProfile = profile || route.params?.profile || null;
  const [name, setName] = useState(preloadedProfile?.name || '');
  const [hospital, setHospital] = useState(preloadedProfile?.doctorData?.hospital || '');
  const [registrationNumber, setRegistrationNumber] = useState(
    preloadedProfile?.doctorData?.registrationNumber || '',
  );
  const [specialty, setSpecialty] = useState(preloadedProfile?.doctorData?.specialty || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!name || !hospital || !registrationNumber) {
      setError('Please complete the required fields.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError('No authenticated user found.');
      return;
    }

    try {
      setLoading(true);
      await updateUserProfile(user.uid, {
        name: name.trim(),
        onboardingCompleted: true,
        doctorData: {
          hospital: hospital.trim(),
          registrationNumber: registrationNumber.trim(),
          specialty: specialty.trim() || undefined,
        },
      });

      const refreshed = await getUserProfile(user.uid);
      if (refreshed) {
        onCompleted?.(refreshed);
      }
      navigation.replace('DoctorApp');
    } catch (err) {
      console.error(err);
      setError('Could not save your details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.container}>
        <Text style={styles.title}>Doctor Onboarding</Text>
        <Text style={styles.subtitle}>Step 1 of 1 - Basic Details</Text>

        <TextInput label="Full Name" value={name} onChangeText={setName} placeholder="Dr. Jane Doe" />
        <TextInput
          label="Hospital / Clinic"
          value={hospital}
          onChangeText={setHospital}
          placeholder="City Hospital"
        />
        <TextInput
          label="Registration Number"
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholder="MED-123456"
        />
        <TextInput
          label="Specialty (optional)"
          value={specialty}
          onChangeText={setSpecialty}
          placeholder="Obstetrics"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Continue" onPress={handleSubmit} loading={loading} />
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
  },
  error: {
    color: colors.critical,
    marginVertical: spacing.sm,
  },
});

export default DoctorOnboardingScreen;
