import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  FirestoreDataConverter,
  getDoc,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { Appointment, AppointmentStatus, RiskLevel } from '../types/appointment';

const appointmentConverter: FirestoreDataConverter<Appointment> = {
  toFirestore(appt: Appointment) {
    return appt;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data() as Appointment;
    return { ...data, id: snapshot.id };
  },
};

const appointmentsCol = collection(firestore, 'appointments').withConverter(appointmentConverter);

export const createAppointment = async (
  doctorId: string,
  patientId: string,
  scheduledAt: Date,
  reason?: string,
): Promise<void> => {
  const payload: any = {
    doctorId,
    patientId,
    scheduledAt,
    status: 'upcoming' as AppointmentStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (reason && reason.trim()) {
    payload.reason = reason.trim();
  }
  await addDoc(appointmentsCol, {
    ...payload,
  });
};

export const subscribeDoctorAppointments = (doctorId: string, callback: (appointments: Appointment[]) => void) => {
  const q = query(appointmentsCol, where('doctorId', '==', doctorId), orderBy('scheduledAt', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => d.data())));
};

export const subscribePatientAppointments = (patientId: string, callback: (appointments: Appointment[]) => void) => {
  const q = query(appointmentsCol, where('patientId', '==', patientId), orderBy('scheduledAt', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => d.data())));
};

export const markAppointmentCompleted = async (
  appointmentId: string,
  summary: string,
  riskLevel?: RiskLevel,
): Promise<void> => {
  await updateDoc(doc(firestore, 'appointments', appointmentId), {
    status: 'completed',
    visitSummary: summary,
    riskLevel,
    updatedAt: serverTimestamp(),
  });
};

export const cancelAppointment = async (appointmentId: string): Promise<void> => {
  await updateDoc(doc(firestore, 'appointments', appointmentId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
};

export const getAppointment = async (appointmentId: string): Promise<Appointment | null> => {
  const snap = await getDoc(doc(firestore, 'appointments', appointmentId).withConverter(appointmentConverter));
  return snap.exists() ? snap.data() : null;
};
