import { Timestamp } from 'firebase/firestore';

export interface DoctorPatientLink {
  patientId: string;
  linkedAt: Timestamp | Date;
}
