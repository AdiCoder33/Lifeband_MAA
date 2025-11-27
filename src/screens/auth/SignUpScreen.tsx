import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../../components/Button';
import ScreenContainer from '../../components/ScreenContainer';
import TextInput from '../../components/TextInput';
import { AuthStackParamList } from '../../types/navigation';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { signUpWithEmail, useGoogleAuth } from '../../services/authService';
import { createUserProfileFromAuth } from '../../services/userService';
import { UserRole } from '../../types/user';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { request, response, promptAsync, signInWithGoogleResponse } = useGoogleAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill out all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const user = await signUpWithEmail(name.trim(), email.trim(), password);
      await createUserProfileFromAuth(user, role, { name: name.trim() });
    } catch (err) {
      console.error(err);
      setError('Account creation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleGoogle = async () => {
      if (!response) return;
      try {
        setGoogleLoading(true);
        await signInWithGoogleResponse(response);
      } catch (err) {
        console.error(err);
        setError('Google sign-in failed. Try again.');
      } finally {
        setGoogleLoading(false);
      }
    };
    handleGoogle();
  }, [response, signInWithGoogleResponse]);

  return (
    <ScreenContainer scrollable>
      <View style={styles.container}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Choose your role and get started.</Text>

        <TextInput label="Full Name" value={name} onChangeText={setName} placeholder="Jane Doe" />
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
        />
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="********"
        />
        <TextInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="********"
        />

        <Text style={styles.label}>I am a</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'patient' && styles.roleCardActive]}
            onPress={() => setRole('patient')}
          >
            <Text style={styles.roleTitle}>Pregnant Mother</Text>
            <Text style={styles.roleSubtitle}>Maternal care journey</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleCard, role === 'doctor' && styles.roleCardActive]}
            onPress={() => setRole('doctor')}
          >
            <Text style={styles.roleTitle}>Doctor</Text>
            <Text style={styles.roleSubtitle}>Medical companion</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Create Account" onPress={handleSubmit} loading={loading} />
        <Button
          title="Sign In with Google"
          variant="google"
          onPress={() => promptAsync()}
          disabled={!request}
          loading={googleLoading}
        />

        <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.link}>Already have an account? Sign In</Text>
        </TouchableOpacity>
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
    color: colors.secondary,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  roleCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  roleCardActive: {
    borderColor: colors.secondary,
    backgroundColor: '#EDF0FF',
  },
  roleTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  roleSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  error: {
    color: colors.critical,
    marginBottom: spacing.sm,
  },
  link: {
    color: colors.secondary,
    marginTop: spacing.md,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default SignUpScreen;
