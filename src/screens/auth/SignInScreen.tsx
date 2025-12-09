import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import ScreenContainer from '../../components/ScreenContainer';
import TextInput from '../../components/TextInput';
import { AuthStackParamList } from '../../types/navigation';
import { colors, shadows, spacing, typography } from '../../theme/theme';
import { signInWithEmail, signInWithGoogleNative } from '../../services/authService';
import { getUserProfile } from '../../services/userService';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

const GoogleIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24">
    <Path
      d="M23.49 12.27c0-.82-.07-1.64-.21-2.43H12v4.61h6.44c-.28 1.49-1.12 2.75-2.37 3.6v3h3.82c2.23-2.06 3.5-5.1 3.5-8.78z"
      fill="#4285F4"
    />
    <Path
      d="M12 24c3.18 0 5.85-1.05 7.8-2.85l-3.82-3c-1.06.72-2.43 1.14-3.98 1.14-3.06 0-5.66-2.07-6.59-4.86H1.5v3.05C3.44 21.33 7.42 24 12 24z"
      fill="#34A853"
    />
    <Path
      d="M5.41 14.43A7.18 7.18 0 0 1 4.98 12c0-.85.15-1.68.42-2.43V6.52H1.5A11.96 11.96 0 0 0 0 12c0 1.9.45 3.69 1.5 5.48l3.91-3.05z"
      fill="#FBBC05"
    />
    <Path
      d="M12 4.75c1.74 0 3.3.6 4.53 1.78l3.38-3.38C17.82 1.16 15.15 0 12 0 7.42 0 3.44 2.67 1.5 6.52l3.9 3.05C6.34 6.82 8.94 4.75 12 4.75z"
      fill="#EA4335"
    />
  </Svg>
);

const appLogo = require('../../../assets/adaptive-icon.png');

const BackgroundGradientLayer = () => (
  <Svg
    style={styles.backgroundGradient}
    width="100%"
    height="100%"
    preserveAspectRatio="none"
    pointerEvents="none"
  >
    <Defs>
      <SvgLinearGradient id="backgroundGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FFF7F9" />
        <Stop offset="100%" stopColor="#F5F1FF" />
      </SvgLinearGradient>
    </Defs>
    <Rect x="0" y="0" width="100%" height="100%" fill="url(#backgroundGradient)" />
  </Svg>
);

const GlowBlob: React.FC<{
  style: StyleProp<ViewStyle>;
  gradientId: string;
  startColor: string;
  endColor?: string;
}> = ({ style, gradientId, startColor, endColor = 'rgba(255, 255, 255, 0)' }) => (
  <Svg
    style={StyleSheet.flatten(style) as any}
    width="50%"
    height="100%"
    preserveAspectRatio="none"
    pointerEvents="none"
  >
    <Defs>
      <RadialGradient id={gradientId} cx="50%" cy="50%" rx="50%" ry="50%">
        <Stop offset="0%" stopColor={startColor} />
        <Stop offset="100%" stopColor={endColor} />
      </RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
  </Svg>
);

const SignInScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const [googleLoading, setGoogleLoading] = useState(false);

  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslate = useRef(new Animated.Value(24)).current;
  const buttonScales = useMemo(() => [new Animated.Value(1), new Animated.Value(1)], []);
  const placeholderColor = 'rgba(85, 57, 98, 0.45)';

  const handleFieldFocus = useCallback((field: 'email' | 'password') => () => {
    setFocusedField(field);
  }, []);

  const handleFieldBlur = useCallback((field: 'email' | 'password') => () => {
    setFocusedField(current => (current === field ? null : current));
  }, []);

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

  const handleGoogleSignIn = useCallback(async () => {
    try {
      setError(null);
      setGoogleLoading(true);
      const user = await signInWithGoogleNative();
      if (user) {
        await getUserProfile(user.uid);
      }
    } catch (err) {
      console.error(err);
      setError('Google sign-in failed. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(formTranslate, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [formOpacity, formTranslate]);

  const handleButtonPressIn = (index: number) => {
    Animated.spring(buttonScales[index], {
      toValue: 0.96,
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
    icon?: React.ReactNode,
  ) => (
    <Animated.View key={label} style={[styles.buttonWrapper, { transform: [{ scale: buttonScales[index] }] }]}
    >
      <Pressable
        onPressIn={() => handleButtonPressIn(index)}
        onPressOut={() => handleButtonPressOut(index)}
        onPress={onPress}
        disabled={disabled || loadingState}
        style={styles.buttonTouchable}
      >
        {({ pressed }) => {
          if (variant === 'google') {
            return (
              <View
                style={[
                  styles.buttonBase,
                  styles.buttonGoogle,
                  pressed && styles.buttonGooglePressed,
                  (disabled || loadingState) && styles.buttonDisabled,
                ]}
              >
                <View style={styles.buttonContent}>
                  {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
                  <Text style={styles.buttonTextGoogle}>{loadingState ? 'Loading...' : label}</Text>
                </View>
              </View>
            );
          }

          const gradientColors = pressed ? ['#F26E7D', '#EA5C76'] : ['#FF92A0', '#F47DA8'];
          const gradientId = `primary-${index}`;

          return (
            <View
              style={[styles.buttonBase, styles.buttonPrimary, (disabled || loadingState) && styles.buttonDisabled]}
            >
              <Svg style={styles.buttonPrimaryGradient} width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <SvgLinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={gradientColors[0]} />
                    <Stop offset="100%" stopColor={gradientColors[1]} />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" rx={18} ry={18} fill={`url(#${gradientId})`} />
              </Svg>
              <View style={styles.buttonContent}>
                {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
                <Text style={styles.buttonText}>{loadingState ? 'Loading...' : label}</Text>
              </View>
            </View>
          );
        }}
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
          <Animated.View
            style={[styles.content, { opacity: formOpacity, transform: [{ translateY: formTranslate }] }]}
          >
            <View style={styles.heroSection}>
              <View style={styles.logoContainer}>
                <Image source={appLogo} style={styles.logo} resizeMode="contain" />
              </View>
              <Text style={styles.heroTitle}>Welcome back</Text>
              <Text style={styles.heroSubtitle}>Log in to continue caring for mums and babies.</Text>
            </View>

            <View style={styles.formWrapper}>
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@lifebandcare.com"
                placeholderTextColor={placeholderColor}
                onFocus={handleFieldFocus('email')}
                onBlur={handleFieldBlur('email')}
                style={[styles.inputSurface, focusedField === 'email' && styles.inputSurfaceFocused]}
              />

              <Text style={styles.formLabel}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="********"
                placeholderTextColor={placeholderColor}
                onFocus={handleFieldFocus('password')}
                onBlur={handleFieldBlur('password')}
                style={[styles.inputSurface, focusedField === 'password' && styles.inputSurfaceFocused]}
              />

              <Text style={styles.forgotPassword}>Forgot Password? (coming soon)</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {renderAnimatedButton('Sign In', 0, handleSubmit, 'primary', loading, loading)}
              {renderAnimatedButton(
                'Continue with Google',
                1,
                handleGoogleSignIn,
                'google',
                googleLoading,
                googleLoading,
                !googleLoading ? <GoogleIcon /> : null,
              )}

              <Pressable onPress={() => navigation.navigate('SignUp')} style={styles.createAccountButton}>
                <Text style={styles.createAccountText}>Create a new account</Text>
              </Pressable>
            </View>

            <Text style={styles.helperText}>We keep every visit protected with medical-grade security.</Text>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  keyboard: {
    flex: 1,
  },
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  content: {
    gap: spacing.lg,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  heroSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoContainer: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(252, 225, 231, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FAD4E2',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  logo: {
    width: 44,
    height: 44,
  },
  heroTitle: {
    fontSize: typography.heading + 8,
    color: colors.secondary,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroSubtitle: {
    textAlign: 'center',
    fontSize: typography.body,
    color: 'rgba(64, 49, 90, 0.7)',
    lineHeight: 22,
  },
  formWrapper: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  formLabel: {
    color: 'rgba(64, 49, 90, 0.85)',
    fontSize: typography.small,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  inputSurface: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 205, 218, 0.55)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.99)',
  },
  inputSurfaceFocused: {
    borderColor: colors.primary,
    shadowColor: '#F8BBD0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    color: 'rgba(90, 66, 110, 0.6)',
    fontSize: typography.small,
  },
  error: {
    color: colors.critical,
    textAlign: 'center',
    fontWeight: '600',
  },
  helperText: {
    marginTop: spacing.lg,
    textAlign: 'center',
    color: 'rgba(90, 66, 110, 0.6)',
    fontSize: typography.small,
    lineHeight: 18,
  },
  buttonWrapper: {
    marginTop: spacing.md,
    borderRadius: 18,
    width: '100%',
  },
  buttonTouchable: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  buttonBase: {
    borderRadius: 18,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#F47DA8',
    overflow: 'hidden',
  },
  buttonPrimaryGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  buttonGoogle: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(86, 124, 180, 0.25)',
    paddingHorizontal: spacing.md,
  },
  buttonGooglePressed: {
    borderColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body,
  },
  buttonTextGoogle: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: typography.body,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  createAccountButton: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  createAccountText: {
    color: colors.secondary,
    fontWeight: '600',
    fontSize: typography.body,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default SignInScreen;
