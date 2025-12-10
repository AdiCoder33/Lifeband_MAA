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
  ScrollView,
  Dimensions,
  TouchableOpacity,
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
import { colors, shadows, spacing, typography, radii } from '../../theme/theme';
import { signUpWithEmail, signInWithGoogleNative } from '../../services/authService';
import { createUserProfileFromAuth, getUserProfile } from '../../services/userService';
import { UserRole } from '../../types/user';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

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

const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'name' | 'email' | 'password' | 'confirm' | null>(null);

  const [googleLoading, setGoogleLoading] = useState(false);

  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslate = useRef(new Animated.Value(24)).current;
  const buttonScales = useMemo(() => [new Animated.Value(1), new Animated.Value(1)], []);
  const placeholderColor = 'rgba(64, 49, 90, 0.4)';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(formTranslate, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [formOpacity, formTranslate]);

  const handleGoogleSignUp = useCallback(async () => {
    try {
      setError(null);
      setGoogleLoading(true);
      const user = await signInWithGoogleNative();
      if (!user) {
        return;
      }
      const existingProfile = await getUserProfile(user.uid);
      if (existingProfile) {
        setError(`This Google account already exists. Signing you in as ${existingProfile.role}.`);
        return;
      }
      await createUserProfileFromAuth(user, role, { name: user.displayName || '' });
    } catch (err) {
      console.error(err);
      setError('Google sign-up failed. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [role]);

  const handleFieldFocus = useCallback((field: 'name' | 'email' | 'password' | 'confirm') => () => {
    setFocusedField(field);
  }, []);
  const handleFieldBlur = useCallback((field: 'name' | 'email' | 'password' | 'confirm') => () => {
    setFocusedField(current => (current === field ? null : current));
  }, []);

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

  const handleButtonPressIn = (index: number) => {
    Animated.spring(buttonScales[index], { toValue: 0.96, useNativeDriver: true, speed: 28, bounciness: 10 }).start();
  };
  const handleButtonPressOut = (index: number) => {
    Animated.spring(buttonScales[index], { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }).start();
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
    <Animated.View key={label} style={[styles.buttonWrapper, { transform: [{ scale: buttonScales[index] }] }]}>
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

          const gradientColors = pressed ? ['#FF88A0', '#F45C88'] : ['#FF92A0', '#F47DA8'];
          const gradientId = `primary-${index}`;

          return (
            <View style={[styles.buttonBase, styles.buttonPrimary, (disabled || loadingState) && styles.buttonDisabled]}>
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
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.content, { opacity: formOpacity, transform: [{ translateY: formTranslate }] }]}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            
            <View style={styles.heroSection}>
              <View style={styles.logoContainer}>
                <Image source={appLogo} style={styles.logo} resizeMode="contain" />
              </View>
              <Text style={styles.heroTitle}>Create account</Text>
              <Text style={styles.heroSubtitle}>Sign up to continue caring for mums and babies.</Text>
            </View>

            <View style={styles.formWrapper}>
              <Text style={styles.formLabel}>Full name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Jane Doe"
                placeholderTextColor={placeholderColor}
                onFocus={handleFieldFocus('name')}
                onBlur={handleFieldBlur('name')}
                style={[styles.inputSurface, focusedField === 'name' && styles.inputSurfaceFocused]}
              />

              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
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

              <Text style={styles.formLabel}>Confirm Password</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="********"
                placeholderTextColor={placeholderColor}
                onFocus={handleFieldFocus('confirm')}
                onBlur={handleFieldBlur('confirm')}
                style={[styles.inputSurface, focusedField === 'confirm' && styles.inputSurfaceFocused]}
              />

              <Text style={styles.label}>I am a</Text>
              <View style={styles.roleRow}>
                <Pressable 
                  style={[styles.roleCard, role === 'patient' && styles.roleCardActive]} 
                  onPress={() => setRole('patient')}
                  activeOpacity={0.8}
                >
                  <View style={styles.roleIconContainer}>
                    <Text style={styles.roleIcon}>🤰</Text>
                  </View>
                  <Text style={styles.roleTitle}>Pregnant Mother</Text>
                  <Text style={styles.roleSubtitle}>Maternal care journey</Text>
                </Pressable>
                <Pressable 
                  style={[styles.roleCard, role === 'doctor' && styles.roleCardActive]} 
                  onPress={() => setRole('doctor')}
                  activeOpacity={0.8}
                >
                  <View style={styles.roleIconContainer}>
                    <Text style={styles.roleIcon}>👨‍⚕️</Text>
                  </View>
                  <Text style={styles.roleTitle}>Doctor</Text>
                  <Text style={styles.roleSubtitle}>Medical companion</Text>
                </Pressable>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {renderAnimatedButton('Create Account', 0, handleSubmit, 'primary', loading, loading)}
              {renderAnimatedButton(
                'Continue with Google',
                1,
                handleGoogleSignUp,
                'google',
                googleLoading,
                googleLoading,
                !googleLoading ? <GoogleIcon /> : null,
              )}

              <Pressable onPress={() => navigation.navigate('SignIn')} style={styles.createAccountButton}>
                <Text style={styles.createAccountText}>Already have an account? Sign In</Text>
              </Pressable>
            </View>

            <Text style={styles.helperText}>We keep every visit protected with medical-grade security.</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_SMALL_DEVICE = SCREEN_WIDTH < 375;
const HORIZONTAL_PADDING = IS_SMALL_DEVICE ? spacing.sm : spacing.md;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: spacing.lg,
    minHeight: SCREEN_HEIGHT,
  },
  content: {
    gap: IS_SMALL_DEVICE ? spacing.xs : spacing.sm,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  backButtonText: {
    fontSize: typography.body,
    color: colors.secondary,
    fontWeight: '600',
  },
  heroSection: {
    alignItems: 'center',
    gap: IS_SMALL_DEVICE ? spacing.xs : spacing.sm,
    marginBottom: spacing.sm,
  },
  logoContainer: {
    width: IS_SMALL_DEVICE ? 64 : 74,
    height: IS_SMALL_DEVICE ? 64 : 74,
    borderRadius: IS_SMALL_DEVICE ? 32 : 37,
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
    fontSize: IS_SMALL_DEVICE ? typography.heading + 2 : typography.heading + 6,
    color: colors.secondary,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  heroSubtitle: {
    textAlign: 'center',
    fontSize: IS_SMALL_DEVICE ? typography.small : typography.body,
    color: 'rgba(64, 49, 90, 0.7)',
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
  },
  formWrapper: {
    marginTop: spacing.sm,
    gap: IS_SMALL_DEVICE ? spacing.xs : spacing.sm,
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
    paddingVertical: IS_SMALL_DEVICE ? spacing.sm : spacing.sm + 2,
    paddingHorizontal: IS_SMALL_DEVICE ? spacing.sm : spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.99)',
    fontSize: IS_SMALL_DEVICE ? typography.small : typography.body,
  },

  inputSurfaceFocused: {
    borderColor: colors.primary,
    shadowColor: '#F8BBD0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  label: {
    color: 'rgba(64, 49, 90, 0.85)',
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  roleCard: {
    flex: 1,
    padding: IS_SMALL_DEVICE ? spacing.md : spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'rgba(230,230,230,0.9)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: IS_SMALL_DEVICE ? 110 : 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  roleCardActive: {
    borderColor: colors.secondary,
    backgroundColor: '#EDF0FF',
    shadowColor: colors.secondary,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  roleIconContainer: {
    marginBottom: spacing.xs,
  },
  roleIcon: {
    fontSize: IS_SMALL_DEVICE ? 32 : 40,
    textAlign: 'center',
  },
  roleTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: IS_SMALL_DEVICE ? typography.small : typography.body,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  roleSubtitle: {
    color: colors.textSecondary,
    fontSize: IS_SMALL_DEVICE ? typography.small - 1 : typography.small,
    textAlign: 'center',
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
    marginTop: IS_SMALL_DEVICE ? spacing.xs : spacing.sm,
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
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',

  },
  buttonPrimary: {
    backgroundColor: '#FF92A0',
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
    paddingHorizontal: spacing.xs,
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
    marginTop: spacing.xs,
  },
  createAccountText: {
    color: colors.secondary,
    fontWeight: '300',
    fontSize: typography.body,
  },
});

export default SignUpScreen;
