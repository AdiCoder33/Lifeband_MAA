import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
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

  return (
    <ScreenContainer>
      <View style={styles.top}>
        <View style={styles.logoWrapper}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>LB</Text>
          </View>
          <Text style={styles.appName}>LifeBand MAA</Text>
          <Text style={styles.tagline}>Maternal & Medical support made simple.</Text>
        </View>
        <Image style={styles.illustration} source={require('../../assets/adaptive-icon.png')} />
      </View>

      <View style={styles.actions}>
        <Button title="Sign In" onPress={() => navigation.navigate('SignIn')} />
        <Button
          title="Create Account"
          variant="outline"
          onPress={() => navigation.navigate('SignUp')}
        />
        <Text style={styles.separator}>or</Text>
        <Button
          title="Sign In with Google"
          variant="google"
          onPress={() => promptAsync()}
          disabled={!request}
          loading={loadingGoogle}
        />
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
  logoWrapper: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoCircle: {
    backgroundColor: colors.primary,
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoText: {
    color: colors.white,
    fontSize: typography.heading,
    fontWeight: '800',
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
    width: 80,
    height: 80,
    marginTop: spacing.md,
    tintColor: colors.accent,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  separator: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.sm,
    fontSize: typography.body,
  },
  error: {
    color: colors.critical,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

export default WelcomeScreen;
