const dotenv = require('dotenv');

dotenv.config();

const withEnv = (key) => {
  const value = process.env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const firebaseExtra = {
  apiKey: withEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: withEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: withEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: withEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: withEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: withEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  measurementId: withEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID'),
};

const googleOAuthExtra = {
  expoClientId: withEnv('EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID'),
  iosClientId: withEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  androidClientId: withEnv('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
  webClientId: withEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
};

module.exports = {
  expo: {
    name: 'Lifeband_MAA',
    slug: 'Lifeband_MAA',
    scheme: 'lifebandmaa',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
      package: 'com.anonymous.Lifeband_MAA',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-camera', 'expo-document-picker', 'expo-asset'],
    extra: {
      eas: {
        projectId: '561d6199-873a-4ec2-b46e-0460eba170cb',
      },
      firebase: firebaseExtra,
      googleOAuth: googleOAuthExtra,
    },
  },
};
