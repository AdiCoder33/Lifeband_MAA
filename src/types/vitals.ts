export interface VitalsSample {
  // Core vitals
  hr: number;
  bp_sys: number;
  bp_dia: number;
  spo2?: number;
  hrv?: number;
  ptt?: number;
  ecg?: number;
  ir?: number;
  red?: number;
  timestamp: number;
  
  // Extended heart rate sources
  hr_ecg?: number;        // ECG-based heart rate
  hr_ppg?: number;        // PPG-based heart rate
  hr_source?: string;     // "ECG", "PPG", or "NONE"
  
  // Signal quality metrics
  ecg_quality?: number;   // ECG signal quality (0-100)
  ppg_quality?: number;   // PPG signal quality (0-100)
  
  // Blood pressure method
  bp_method?: string;     // "PTT" or "ECG"
  
  // HRV metrics
  hrv_sdnn?: number;      // Standard deviation of R-R intervals
  
  // AI: Arrhythmia Detection
  rhythm?: string;        // "Normal", "AFib", "PVC", "Bradycardia", "Tachycardia", etc.
  rhythm_confidence?: number;  // AI confidence (0-100)
  arrhythmia_alert?: boolean;  // Critical arrhythmia flag
  
  // AI: Anemia Detection
  anemia_risk?: string;   // "Low", "Low-Moderate", "Moderate", "High", "Critical"
  anemia_confidence?: number;  // AI confidence (0-100)
  anemia_alert?: boolean;      // Critical anemia flag
  
  // AI: Preeclampsia Detection
  preeclampsia_risk?: string;  // "Low", "Low-Moderate", "Moderate", "High", "Critical"
  preeclampsia_confidence?: number;  // AI confidence (0-100)
  preeclampsia_alert?: boolean;      // Critical preeclampsia flag
  
  // Overall maternal health score
  maternal_health_score?: number;  // 0-100 overall health metric
  
  // Buffered data flag
  buffered?: boolean;     // True if this is historical buffered data

  // Aggregated sampling metadata
  aggregated?: boolean;   // True if this record represents a computed average
  bucketStart?: number;   // Epoch ms marking the start of the aggregation window
  bucketEnd?: number;     // Epoch ms marking the end of the aggregation window
  bucketDurationMs?: number; // Duration of the aggregation window in ms
  sampleCount?: number;   // Number of raw samples that fed into the aggregate
  lastSampleTimestamp?: number; // Timestamp of the most recent raw reading in the bucket
}

export interface HourlySummary {
  type: 'hourly_summary';
  timestamp: number;
  period_start: number;
  period_duration_mins: number;
  total_readings: number;
  
  // Averaged vitals
  avg_hr: number;
  avg_spo2: number;
  avg_bp_sys: number;
  avg_bp_dia: number;
  avg_hrv: number;
  
  // AI summary
  anemia_risk: string;
  preeclampsia_risk: string;
  arrhythmia_count: number;
  maternal_health_score: number;
}
