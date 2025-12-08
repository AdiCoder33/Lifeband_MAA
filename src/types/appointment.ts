import { Timestamp } from 'firebase/firestore';

export type AppointmentStatus = 'upcoming' | 'completed' | 'cancelled';
export type RiskLevel = 'stable' | 'needs_attention' | 'critical';

export interface ReportAnalysis {
  summary: string;
  findings?: string[];
  riskFlags?: string[];
  model?: string;
  updatedAt?: Date | Timestamp;
}

export interface Appointment {
  id?: string;
  doctorId: string;
  patientId: string;
  scheduledAt: Timestamp;
  status: AppointmentStatus;
  reason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  visitSummary?: string;
  riskLevel?: RiskLevel;
}

export interface ReportMeta {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: Date | Timestamp;
  mimeType: string;
  extractedText?: string;
  analysis?: ReportAnalysis;
}
