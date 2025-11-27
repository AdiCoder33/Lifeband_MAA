import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { UserProfile } from './user';

export type RootStackParamList = {
  Loading: undefined;
  AuthStack: undefined;
  RoleSelection: undefined;
  PatientOnboarding: { profile?: UserProfile | null };
  DoctorOnboarding: { profile?: UserProfile | null };
  PatientApp: undefined;
  DoctorApp: undefined;
};

export type AuthStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
};

export type PatientStackParamList = {
  PatientHome: undefined;
};

export type DoctorStackParamList = {
  DoctorHome: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
