import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { SUPABASE_ANON_KEY, SUPABASE_PROJECT_URL, supabase } from './supabaseClient';
import { firestore } from './firebase';
import { ReportMeta } from '../types/appointment';

export type ReportUploadResult = {
  fileUrl: string;
  fileName: string;
  contentType: string;
};

/**
 * Upload a report to Supabase Storage (bucket: reports) and store metadata in Firestore
 * under appointments/{appointmentId}/reports.
 */
export async function uploadReportFileSupabase(
  doctorId: string,
  patientId: string,
  appointmentId: string,
): Promise<ReportUploadResult | null> {
  // Ensure Buffer is available
  (globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const uri = asset.uri;
    let inferredType = asset.mimeType || 'application/octet-stream';
    // Build upload data from base64 -> Uint8Array to avoid Blob issues
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
    const buffer = Buffer.from(base64, 'base64'); // Uint8Array
    const uploadData = buffer; // supabase accepts Uint8Array/ArrayBuffer
    const rawName = uri.split('/').pop() || `report-${Date.now()}`;
    const safeFileName = encodeURIComponent(rawName);
    const path = `appointments/${appointmentId}/${safeFileName}`;

    // Upload via REST (works reliably on RN)
    const uploadUrl = `${SUPABASE_PROJECT_URL}/storage/v1/object/reports/${path}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': inferredType,
        'x-upsert': 'true',
      },
      body: uploadData,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Upload failed (${res.status}): ${txt}`);
    }

    // Build public URL (bucket is public)
    const fileUrl = `${SUPABASE_PROJECT_URL}/storage/v1/object/public/reports/${path}`;

    // Save metadata to Firestore
    await addDoc(collection(firestore, 'appointments', appointmentId, 'reports'), {
      doctorId,
      patientId,
      appointmentId,
      fileName: rawName,
      fileUrl,
      contentType: inferredType,
      uploadedAt: serverTimestamp(),
    });

    return { fileUrl, fileName: rawName, contentType: inferredType };
  } catch (e: any) {
    console.error('Report upload failed', e);
    throw e;
  }
}

/**
 * Subscribe to reports for an appointment.
 */
export const subscribeAppointmentReports = (
  appointmentId: string,
  callback: (reports: ReportMeta[]) => void,
) => {
  const reportsCol = collection(firestore, 'appointments', appointmentId, 'reports');
  const q = query(reportsCol, orderBy('uploadedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const items: ReportMeta[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        mimeType: data.contentType,
        uploadedAt: data.uploadedAt,
      };
    });
    callback(items);
  });
};
