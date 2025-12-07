export type VitalsFeedback = {
  windowStart: number; // ms epoch
  windowEnd: number; // ms epoch
  stats: {
    hr_avg: number;
    hr_min: number;
    hr_max: number;
    bp_sys_avg: number;
    bp_sys_min: number;
    bp_sys_max: number;
    bp_dia_avg: number;
    bp_dia_min: number;
    bp_dia_max: number;
    spo2_avg: number;
    spo2_min: number;
    spo2_max: number;
    temp_avg?: number;
    temp_min?: number;
    temp_max?: number;
    hrv_avg?: number;
    hrv_min?: number;
    hrv_max?: number;
    count: number;
  };
  riskLevel: 'stable' | 'needs_attention' | 'critical';
  feedback: string;
  modelVersion: string;
  generatedAt: number;
};

