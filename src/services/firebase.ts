import Constants from 'expo-constants';
import { FirebaseOptions, getApps, initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

type FirebaseConfigShape = FirebaseOptions & { measurementId?: string };

const REQUIRED_CONFIG_KEYS: (keyof FirebaseOptions)[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

const sanitizeValue = (value?: string | null) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('YOUR_')) {
    return undefined;
  }
  return trimmed;
};

const pickDefined = (config: Partial<FirebaseConfigShape>): Partial<FirebaseConfigShape> =>
  Object.fromEntries(
    Object.entries(config).filter(([, value]) => typeof value === 'string' && value.length > 0),
  ) as Partial<FirebaseConfigShape>;

const configFromEnv = (): Partial<FirebaseConfigShape> => ({
  apiKey: sanitizeValue(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: sanitizeValue(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: sanitizeValue(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: sanitizeValue(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: sanitizeValue(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: sanitizeValue(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  measurementId: sanitizeValue(process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID),
});

const configFromExtra = (): Partial<FirebaseConfigShape> => {
  const extra =
    Constants?.expoConfig?.extra ?? (Constants?.manifest?.extra as Record<string, unknown> | undefined);
  const firebaseExtra = (extra?.firebase ?? {}) as Record<string, string | undefined>;
  return pickDefined(firebaseExtra as Partial<FirebaseConfigShape>);
};

const resolveFirebaseConfig = (): FirebaseConfigShape => {
  const mergedConfig = {
    ...configFromExtra(),
    ...configFromEnv(),
  } as Partial<FirebaseConfigShape>;

  const missingKeys = REQUIRED_CONFIG_KEYS.filter((key) => !mergedConfig[key]);
  if (missingKeys.length) {
    throw new Error(
      `Missing Firebase configuration for: ${missingKeys.join(', ')}. ` +
        'Define EXPO_PUBLIC_FIREBASE_* env vars or set extra.firebase in app.config.js.',
    );
  }

  return mergedConfig as FirebaseConfigShape;
};

const firebaseConfig = resolveFirebaseConfig();

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

const authInstance = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

const firestoreInstance = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const auth = authInstance;
export const firestore = firestoreInstance;
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
