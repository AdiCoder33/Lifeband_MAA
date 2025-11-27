import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Button from '../../components/Button';
import ScreenContainer from '../../components/ScreenContainer';
import TextInput from '../../components/TextInput';
import { AuthStackParamList } from '../../types/navigation';
import { colors, spacing, typography } from '../../theme/theme';
import { signInWithEmail, useGoogleAuth } from '../../services/authService';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

const SignInScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { request, response, promptAsync, signInWithGoogleResponse } = useGoogleAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    try {
      setLoading(true);
      await signInWithEmail(email.trim(), password);
    } catch (err) {
      console.error(err);
      setError('Sign in failed. Please check your credentials.');
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
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue caring for mums and babies.</Text>

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="********"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Sign In" onPress={handleSubmit} loading={loading} />
        <Button
          title="Sign In with Google"
          variant="google"
          onPress={() => promptAsync()}
          disabled={!request}
          loading={googleLoading}
        />

        <View style={styles.links}>
          <Text style={styles.linkText} onPress={() => navigation.navigate('SignUp')}>
            Create a new account
          </Text>
          <Text style={styles.linkText}>Forgot Password? (coming soon)</Text>
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: typography.heading,
    color: colors.secondary,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.critical,
    marginBottom: spacing.sm,
  },
  links: {
    marginTop: spacing.md,
  },
  linkText: {
    color: colors.secondary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
});

export default SignInScreen;
