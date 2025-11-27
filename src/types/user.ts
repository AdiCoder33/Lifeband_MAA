import { FieldValue, Timestamp } from 'firebase/firestore';

export type UserRole = 'patient' | 'doctor';

export type AuthProvider = 'password' | 'google';

export type FirebaseTimestamp = Timestamp | FieldValue;

export interface PatientData {
  age: number;
  lmpDate?: string;
  eddDate?: string;
}

export interface DoctorData {
  hospital: string;
  registrationNumber: string;
  specialty?: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  authProvider: AuthProvider;
  googleId?: string;
  createdAt: FirebaseTimestamp;
  updatedAt: FirebaseTimestamp;
  onboardingCompleted: boolean;
  patientData?: PatientData;
  doctorData?: DoctorData;
}
