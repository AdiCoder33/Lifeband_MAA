export interface VitalsSample {
  hr: number;
  bp_sys: number;
  bp_dia: number;
  spo2?: number;
  hrv?: number;
  ptt?: number;
  ecg?: number;
  ir?: number;
  /**
   * Timestamp from device; assumed to be UNIX seconds (base station can convert to ms if needed).
   */
  timestamp: number;
}
