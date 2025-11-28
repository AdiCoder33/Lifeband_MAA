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
  LifeBand: undefined;
  VitalsHistory: undefined;
  LinkDoctor: undefined;
  PatientAppointments: undefined;
  PatientAppointmentDetail: { appointmentId: string };
  AppointmentsCalendar: undefined;
};

export type DoctorStackParamList = {
  DoctorHome: undefined;
  DoctorQR: undefined;
  DoctorPatients: undefined;
  DoctorAppointments: undefined;
  DoctorAppointmentDetail: { appointmentId: string };
  DoctorCreateAppointment: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
