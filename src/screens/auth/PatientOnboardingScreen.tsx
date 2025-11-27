import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Button from '../../components/Button';
import ScreenContainer from '../../components/ScreenContainer';
import TextInput from '../../components/TextInput';
import { RootScreenProps } from '../../types/navigation';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { auth } from '../../services/firebase';
import { getUserProfile, updateUserProfile } from '../../services/userService';
import { UserProfile } from '../../types/user';

type Props = RootScreenProps<'PatientOnboarding'> & {
  profile?: UserProfile | null;
  onCompleted?: (profile: UserProfile) => void;
};

const PatientOnboardingScreen: React.FC<Props> = ({ navigation, route, profile, onCompleted }) => {
  const preloadedProfile = profile || route.params?.profile || null;
  const [name, setName] = useState(preloadedProfile?.name || '');
  const [age, setAge] = useState(preloadedProfile?.patientData?.age ? String(preloadedProfile.patientData.age) : '');
  const [dateChoice, setDateChoice] = useState<'lmp' | 'edd'>('lmp');
  const [lmpDate, setLmpDate] = useState(preloadedProfile?.patientData?.lmpDate || '');
  const [eddDate, setEddDate] = useState(preloadedProfile?.patientData?.eddDate || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!name || !age) {
      setError('Please fill out your name and age.');
      return;
    }
    if (Number.isNaN(Number(age))) {
      setError('Please enter a valid age.');
      return;
    }
    if (dateChoice === 'lmp' && !lmpDate) {
      setError('Please enter your Last Menstrual Period date.');
      return;
    }
    if (dateChoice === 'edd' && !eddDate) {
      setError('Please enter your Expected Due Date.');
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
        patientData: {
          age: Number(age),
          lmpDate: dateChoice === 'lmp' ? lmpDate : undefined,
          eddDate: dateChoice === 'edd' ? eddDate : undefined,
        },
      });

      const refreshed = await getUserProfile(user.uid);
      if (refreshed) {
        onCompleted?.(refreshed);
      }
      navigation.replace('PatientApp');
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
        <Text style={styles.title}>Patient Onboarding</Text>
        <Text style={styles.subtitle}>Step 1 of 1 - Basic Details</Text>

        <TextInput label="Full Name" value={name} onChangeText={setName} placeholder="Your full name" />
        <TextInput
          label="Age"
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          placeholder="32"
        />

        <Text style={styles.label}>Pregnancy Tracking</Text>
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choice, dateChoice === 'lmp' && styles.choiceActive]}
            onPress={() => setDateChoice('lmp')}
          >
            <Text style={[styles.choiceText, dateChoice === 'lmp' && styles.choiceTextActive]}>
              I know my LMP
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choice, dateChoice === 'edd' && styles.choiceActive]}
            onPress={() => setDateChoice('edd')}
          >
            <Text style={[styles.choiceText, dateChoice === 'edd' && styles.choiceTextActive]}>
              I know my EDD
            </Text>
          </TouchableOpacity>
        </View>

        {dateChoice === 'lmp' ? (
          <TextInput
            label="Last Menstrual Period (YYYY-MM-DD)"
            value={lmpDate}
            onChangeText={setLmpDate}
            placeholder="2025-01-01"
          />
        ) : (
          <TextInput
            label="Expected Due Date (YYYY-MM-DD)"
            value={eddDate}
            onChangeText={setEddDate}
            placeholder="2025-10-01"
          />
        )}

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
  label: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  choiceActive: {
    borderColor: colors.primary,
    backgroundColor: '#FCE7E7',
  },
  choiceText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  choiceTextActive: {
    color: colors.primary,
  },
  error: {
    color: colors.critical,
    marginVertical: spacing.sm,
  },
});

export default PatientOnboardingScreen;
