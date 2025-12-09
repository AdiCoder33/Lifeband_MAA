import Constants from 'expo-constants';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  User,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from './firebase';

const extra =
  Constants?.expoConfig?.extra ?? (Constants?.manifest?.extra as Record<string, unknown> | undefined);
const googleOAuthExtra = (extra?.googleOAuth ?? {}) as Record<string, string | undefined>;

const googleConfig = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || googleOAuthExtra.iosClientId,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || googleOAuthExtra.androidClientId,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || googleOAuthExtra.webClientId,
};

let googleConfigured = false;

const ensureGoogleConfigured = () => {
  if (googleConfigured) {
    return;
  }
  
  console.log('Google Config:', {
    webClientId: googleConfig.webClientId ? '✓ Set' : '✗ Missing',
    androidClientId: googleConfig.androidClientId ? '✓ Set' : '✗ Missing',
    iosClientId: googleConfig.iosClientId ? '✓ Set' : '✗ Missing',
  });
  
  if (!googleConfig.webClientId) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Please configure your Google web client ID in .env.',
    );
  }
  
  try {
    GoogleSignin.configure({
      webClientId: googleConfig.webClientId,
      iosClientId: googleConfig.iosClientId,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
    googleConfigured = true;
    console.log('Google Sign-In configured successfully');
  } catch (error) {
    console.error('Failed to configure Google Sign-In:', error);
    throw new Error(
      'Google Sign-In configuration failed. Make sure SHA-1 fingerprint is added to Firebase Console. See GOOGLE_SIGNIN_SETUP.md for instructions.',
    );
  }
};

export const signUpWithEmail = async (name: string, email: string, password: string): Promise<User> => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  return credential.user;
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
};

export const signOutUser = async (): Promise<void> => {
  try {
    ensureGoogleConfigured();
    await GoogleSignin.signOut();
  } catch (error) {
    console.warn('Google sign-out failed', error);
  } finally {
    await signOut(auth);
  }
};

export const signInWithGoogle = async (idToken: string): Promise<User> => {
  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
};

export const signInWithGoogleNative = async (): Promise<User> => {
  try {
    ensureGoogleConfigured();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    let idToken = result.idToken;
    if (!idToken) {
      const tokens = await GoogleSignin.getTokens();
      idToken = tokens?.idToken;
    }
    if (!idToken) {
      throw new Error('Missing Google ID token');
    }
    return signInWithGoogle(idToken);
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    if (error.code === 'DEVELOPER_ERROR') {
      throw new Error(
        'Google Sign-In setup incomplete. Please add SHA-1 fingerprint to Firebase Console. Run: cd android && .\\gradlew signingReport && cd .. to get your SHA-1.',
      );
    }
    throw error;
  }
};
