import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import GLModel from '../components/GLModel';
import ScreenContainer from '../components/ScreenContainer';
import { AuthStackParamList } from '../types/navigation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, typography, radii } from '../theme/theme';
import { useGoogleAuth } from '../services/authService';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { request, response, promptAsync, signInWithGoogleResponse } = useGoogleAuth();
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(32)).current;
  const pulseScale = useRef(new Animated.Value(10)).current;
  const buttonScales = useMemo(() => [new Animated.Value(1), new Animated.Value(1), new Animated.Value(1)], []);

  useEffect(() => {
    const handleGoogle = async () => {
      if (!response) {
        return;
      }
      try {
        setLoadingGoogle(true);
        await signInWithGoogleResponse(response);
      } catch (error) {
        console.error(error);
        setGoogleError('Google sign-in failed. Please try again.');
      } finally {
        setLoadingGoogle(false);
      }
    };
    handleGoogle();
  }, [response, signInWithGoogleResponse]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 750,
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslate, {
        toValue: 0,
        duration: 750,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.sequence([
      Animated.timing(pulseScale, {
        toValue: 1.05,
        duration: 7000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulseScale, {
        toValue: 1,
        duration: 2000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    Animated.loop(pulse).start();
  }, [heroOpacity, heroTranslate, pulseScale]);

  const handleButtonPressIn = (index: number) => {
    Animated.spring(buttonScales[index], {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 30,
      bounciness: 12,
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
    variant: 'primary' | 'outline' | 'google' = 'primary',
    disabled = false,
    loading = false,
  ) => {
    return (
      <Animated.View key={label} style={[styles.buttonWrapper, { transform: [{ scale: buttonScales[index] }] }]}
      >
        <Pressable
          onPressIn={() => handleButtonPressIn(index)}
          onPressOut={() => handleButtonPressOut(index)}
          onPress={onPress}
          disabled={disabled || loading}
          style={({ pressed }) => [
            styles.pressableBase,
            variant === 'outline' && styles.pressableOutline,
            variant === 'google' && styles.pressableGoogle,
            pressed && styles.pressablePressed,
            (disabled || loading) && styles.pressableDisabled,
          ]}
        >
          <Text style={variant === 'outline' || variant === 'google' ? styles.buttonLabelPrimary : styles.buttonLabel}>
            {loading ? 'Loading...' : label}
          </Text>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <ScreenContainer>
      <View style={styles.top}>
        <Animated.View
          style={[styles.heroContainer, { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }]}
        >
          <Animated.View style={[styles.logoAura, { transform: [{ scale: pulseScale }] }]} />
          <View style={styles.logoHero}>
            <Image
              source={require('../../assets/Welcomeimage.png')}
              style={styles.logoImage}
              resizeMode="cover"
              accessible
              accessibilityLabel="LifeBand logo"
            />
          </View>
          <Text style={styles.appName}>LifeBand MAA</Text>
          <Text style={styles.tagline}>Connecting Hearts, Protecting Lives</Text>
        </Animated.View>

        <Animated.View style={[styles.illustration, { transform: [{ translateY: heroTranslate }] }]}>
          <GLModel style={styles.model} />
        </Animated.View>
        <View style={styles.carouselDots}>
          {[0].map((i) => (
            <View key={i} style={[styles.carouselDot, i === 0 && styles.carouselDotActive]} />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        {renderAnimatedButton('Sign In', 0, () => navigation.navigate('SignIn'))}
        {renderAnimatedButton('Create Account', 1, () => navigation.navigate('SignUp'), 'outline')}
        <Text style={styles.separator}>or continue with</Text>
        {renderAnimatedButton('Google', 2, () => promptAsync(), 'google', !request, loadingGoogle)}
        {googleError ? <Text style={styles.error}>{googleError}</Text> : null}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoAura: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(229, 115, 115, 0.16)',
  },
  logoHero: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  logoImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  heroInitial: {
    color: colors.white,
    fontSize: typography.heading + 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
  appName: {
    fontSize: typography.heading + 4,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  tagline: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
  },
  illustration: {
    width: 220,
    height: 220,
    marginTop: spacing.md,
  },
  model: {
    width: '100%',
    height: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  carouselDots: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  carouselDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(40, 53, 147, 0.2)',
    marginHorizontal: 4,
  },
  carouselDotActive: {
    backgroundColor: colors.secondary,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  separator: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.sm,
    fontSize: typography.small,
    letterSpacing: 1,
  },
  error: {
    color: colors.critical,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  buttonWrapper: {
    marginBottom: spacing.sm,
  },
  pressableBase: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressableOutline: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  pressableGoogle: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressablePressed: {
    opacity: 0.85,
  },
  pressableDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body,
  },
  buttonLabelPrimary: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: typography.body,
  },
});

export default WelcomeScreen;
