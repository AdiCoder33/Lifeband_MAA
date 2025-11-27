import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, User } from 'firebase/auth';
import AuthStack from './AuthStack';
import RoleSelectionScreen from '../screens/auth/RoleSelectionScreen';
import PatientOnboardingScreen from '../screens/auth/PatientOnboardingScreen';
import DoctorOnboardingScreen from '../screens/auth/DoctorOnboardingScreen';
import PatientStack from './PatientStack';
import DoctorStack from './DoctorStack';
import { RootStackParamList } from '../types/navigation';
import { auth } from '../services/firebase';
import { getUserProfile } from '../services/userService';
import { UserProfile } from '../types/user';
import { colors, spacing, typography } from '../theme/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={colors.secondary} />
    <Text style={styles.loadingText}>Loading your account...</Text>
  </View>
);

const RootNavigator = () => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfile(null);
        return;
      }
      try {
        setProfileLoading(true);
        const data = await getUserProfile(user.uid);
        setProfile(data);
      } catch (error) {
        console.error(error);
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const handleProfileUpdated = useCallback((updated: UserProfile) => {
    setProfile(updated);
  }, []);

  const isLoading = !authChecked || profileLoading;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isLoading ? (
          <Stack.Screen name="Loading" component={LoadingScreen} />
        ) : !user ? (
          <Stack.Screen name="AuthStack" component={AuthStack} />
        ) : !profile ? (
          <>
            <Stack.Screen name="RoleSelection">
              {(props) => <RoleSelectionScreen {...props} />}
            </Stack.Screen>
            <Stack.Screen name="PatientOnboarding">
              {(props) => (
                <PatientOnboardingScreen
                  {...props}
                  profile={profile}
                  onCompleted={handleProfileUpdated}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="DoctorOnboarding">
              {(props) => (
                <DoctorOnboardingScreen
                  {...props}
                  profile={profile}
                  onCompleted={handleProfileUpdated}
                />
              )}
            </Stack.Screen>
          </>
        ) : !profile.onboardingCompleted ? (
          <>
            {profile.role === 'patient' ? (
              <Stack.Screen name="PatientOnboarding">
                {(props) => (
                  <PatientOnboardingScreen
                    {...props}
                    profile={profile}
                    onCompleted={handleProfileUpdated}
                  />
                )}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="DoctorOnboarding">
                {(props) => (
                  <DoctorOnboardingScreen
                    {...props}
                    profile={profile}
                    onCompleted={handleProfileUpdated}
                  />
                )}
              </Stack.Screen>
            )}
          </>
        ) : profile.role === 'patient' ? (
          <Stack.Screen name="PatientApp">
            {() => <PatientStack profile={profile} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="DoctorApp">
            {() => <DoctorStack profile={profile} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
});

export default RootNavigator;
