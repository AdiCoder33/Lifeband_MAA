import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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

  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslate = useRef(new Animated.Value(24)).current;
  const buttonScales = useMemo(() => [new Animated.Value(1), new Animated.Value(1)], []);

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
      if (!response) {
        return;
      }

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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(formTranslate, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [formOpacity, formTranslate]);

  const handleButtonPressIn = (index: number) => {
    Animated.spring(buttonScales[index], {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 28,
      bounciness: 10,
    }).start();
  };

  const handleButtonPressOut = (index: number) => {
    Animated.spring(buttonScales[index], {
      toValue: 1,
      useNativeDriver: true,
      speed: 12,
      bounciness: 6,
    }).start();
  };

  const renderAnimatedButton = (
    label: string,
    index: number,
    onPress: () => void,
    variant: 'primary' | 'google' = 'primary',
    disabled = false,
    loadingState = false,
  ) => (
    <Animated.View key={label} style={[styles.buttonWrapper, { transform: [{ scale: buttonScales[index] }] }]}
    >
      <Pressable
        onPressIn={() => handleButtonPressIn(index)}
        onPressOut={() => handleButtonPressOut(index)}
        onPress={onPress}
        disabled={disabled || loadingState}
        style={({ pressed }) => [
          styles.buttonBase,
          variant === 'google' && styles.buttonGoogle,
          pressed && styles.buttonPressed,
          (disabled || loadingState) && styles.buttonDisabled,
        ]}
      >
        <Text style={variant === 'google' ? styles.buttonTextSecondary : styles.buttonText}>
          {loadingState ? 'Loading...' : label}
        </Text>
      </Pressable>
    </Animated.View>
  );

  return (
    <ScreenContainer style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={styles.wrapper}>
          <View style={styles.header}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>Clinician Console</Text>
            </View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue caring for mums and babies.</Text>
          </View>

          <Animated.View
            style={[styles.form, { opacity: formOpacity, transform: [{ translateY: formTranslate }] }]}
          >
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

            {renderAnimatedButton('Sign In', 0, handleSubmit, 'primary', loading, loading)}
            {renderAnimatedButton(
              'Continue with Google',
              1,
              () => promptAsync(),
              'google',
              !request || googleLoading,
              googleLoading,
            )}
          </Animated.View>

          <View style={styles.links}>
            <Text style={styles.linkText} onPress={() => navigation.navigate('SignUp')}>
              Create a new account
            </Text>
            <Text style={styles.linkTextMuted}>Forgot Password? (coming soon)</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.lg,
  },
  keyboard: {
    flex: 1,
  },
  wrapper: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  header: {
    gap: spacing.sm,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(77, 182, 172, 0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  headerBadgeText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: typography.heading + 6,
    color: colors.secondary,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  form: {
    gap: spacing.md,
  },
  error: {
    color: colors.critical,
    textAlign: 'center',
  },
  links: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  linkText: {
    color: colors.secondary,
    fontWeight: '600',
  },
  linkTextMuted: {
    color: colors.textSecondary,
  },
  buttonWrapper: {
    marginBottom: spacing.xs,
  },
  buttonBase: {
    backgroundColor: colors.secondary,
    paddingVertical: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGoogle: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body,
  },
  buttonTextSecondary: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: typography.body,
  },
});

export default SignInScreen;
