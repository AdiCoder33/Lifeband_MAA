import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import * as DocumentPicker from 'expo-document-picker';
import { firestore, storage } from './firebase';
import { ReportMeta } from '../types/appointment';

const reportsCollection = (appointmentId: string) =>
  collection(firestore, 'appointments', appointmentId, 'reports');

export const uploadReportFile = async (
  doctorId: string,
  patientId: string,
  appointmentId: string,
): Promise<void> => {
  const pickResult = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (pickResult.canceled || !pickResult.assets?.length) {
    return;
  }
  const file = pickResult.assets[0];
  const fileUri = file.uri;
  const fileName = file.name || `report-${Date.now()}`;
  const mimeType = file.mimeType || 'application/octet-stream';

  const response = await fetch(fileUri);
  const blob = await response.blob();

  const storageRef = ref(storage, `reports/${doctorId}/${patientId}/${appointmentId}/${fileName}`);
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  const url = await getDownloadURL(storageRef);

  await addDoc(reportsCollection(appointmentId), {
    fileName,
    fileUrl: url,
    uploadedAt: serverTimestamp(),
    mimeType,
  });
};

export const subscribeAppointmentReports = (
  appointmentId: string,
  callback: (reports: ReportMeta[]) => void,
) => {
  return onSnapshot(reportsCollection(appointmentId), (snap) => {
    const reports: ReportMeta[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    callback(reports);
  });
};
