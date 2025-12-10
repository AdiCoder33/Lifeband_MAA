import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { firestore } from './firebase';
import { VitalsSample } from '../types/vitals';
import { VitalsFeedback } from '../types/vitalsFeedback';

const feedbackCollectionRef = (userId: string) => collection(firestore, 'users', userId, 'vitals_feedback');
const vitalsCollectionRef = (userId: string) => collection(firestore, 'users', userId, 'vitals');

// Helper to remove undefined values from objects before saving to Firestore
const removeUndefined = (obj: any): any => {
  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        cleaned[key] = removeUndefined(value);
      } else {
        cleaned[key] = value;
      }
    }
  });
  return cleaned;
};

type Stats = VitalsFeedback['stats'];

const initialStats = (): Stats => ({
  hr_avg: 0,
  hr_min: Number.POSITIVE_INFINITY,
  hr_max: Number.NEGATIVE_INFINITY,
  bp_sys_avg: 0,
  bp_sys_min: Number.POSITIVE_INFINITY,
  bp_sys_max: Number.NEGATIVE_INFINITY,
  bp_dia_avg: 0,
  bp_dia_min: Number.POSITIVE_INFINITY,
  bp_dia_max: Number.NEGATIVE_INFINITY,
  spo2_avg: 0,
  spo2_min: Number.POSITIVE_INFINITY,
  spo2_max: Number.NEGATIVE_INFINITY,
  temp_avg: 0,
  temp_min: Number.POSITIVE_INFINITY,
  temp_max: Number.NEGATIVE_INFINITY,
  hrv_avg: 0,
  hrv_min: Number.POSITIVE_INFINITY,
  hrv_max: Number.NEGATIVE_INFINITY,
  count: 0,
});

const finalizeStats = (stats: Stats): Stats | null => {
  if (stats.count === 0) return null;
  const count = stats.count || 1;
  const round = (n: number) => Math.round(n * 10) / 10;
  
  const result: any = {
    hr_avg: round(stats.hr_avg / count),
    hr_min: stats.hr_min === Number.POSITIVE_INFINITY ? 0 : stats.hr_min,
    hr_max: stats.hr_max === Number.NEGATIVE_INFINITY ? 0 : stats.hr_max,
    bp_sys_avg: round(stats.bp_sys_avg / count),
    bp_sys_min: stats.bp_sys_min === Number.POSITIVE_INFINITY ? 0 : stats.bp_sys_min,
    bp_sys_max: stats.bp_sys_max === Number.NEGATIVE_INFINITY ? 0 : stats.bp_sys_max,
    bp_dia_avg: round(stats.bp_dia_avg / count),
    bp_dia_min: stats.bp_dia_min === Number.POSITIVE_INFINITY ? 0 : stats.bp_dia_min,
    bp_dia_max: stats.bp_dia_max === Number.NEGATIVE_INFINITY ? 0 : stats.bp_dia_max,
    spo2_avg: round(stats.spo2_avg / count),
    spo2_min: stats.spo2_min === Number.POSITIVE_INFINITY ? 0 : stats.spo2_min,
    spo2_max: stats.spo2_max === Number.NEGATIVE_INFINITY ? 0 : stats.spo2_max,
    count,
  };
  
  // Only include temp values if they exist
  if (stats.temp_avg && stats.temp_avg > 0) {
    result.temp_avg = round(stats.temp_avg / count);
  }
  if (stats.temp_min !== Number.POSITIVE_INFINITY && stats.temp_min !== undefined) {
    result.temp_min = stats.temp_min;
  }
  if (stats.temp_max !== Number.NEGATIVE_INFINITY && stats.temp_max !== undefined) {
    result.temp_max = stats.temp_max;
  }
  
  // Only include HRV values if they exist
  if (stats.hrv_avg && stats.hrv_avg > 0) {
    result.hrv_avg = round(stats.hrv_avg / count);
  }
  if (stats.hrv_min !== Number.POSITIVE_INFINITY && stats.hrv_min !== undefined) {
    result.hrv_min = stats.hrv_min;
  }
  if (stats.hrv_max !== Number.NEGATIVE_INFINITY && stats.hrv_max !== undefined) {
    result.hrv_max = stats.hrv_max;
  }
  
  return result as Stats;
};

const computeRisk = (stats: Stats): VitalsFeedback['riskLevel'] => {
  const critical = stats.bp_sys_avg >= 160 || stats.bp_dia_avg >= 110 || stats.bp_sys_avg < 90 || stats.spo2_avg < 92;
  if (critical) return 'critical';
  const attention =
    stats.bp_sys_avg >= 140 ||
    stats.bp_dia_avg >= 90 ||
    stats.spo2_avg < 95 ||
    stats.hr_avg > 110 ||
    stats.hr_avg < 50 ||
    (stats.temp_avg || 0) >= 38;
  return attention ? 'needs_attention' : 'stable';
};

const fetchLatestFeedback = async (userId: string): Promise<VitalsFeedback | null> => {
  const snap = await getDocs(query(feedbackCollectionRef(userId), orderBy('windowStart', 'desc'), limit(1)));
  if (snap.empty) return null;
  return snap.docs[0].data() as VitalsFeedback;
};

export const subscribeToLatestVitalsFeedback = (
  userId: string,
  callback: (feedback: VitalsFeedback | null) => void,
) => {
  const q = query(feedbackCollectionRef(userId), orderBy('windowStart', 'desc'), limit(1));
  return onSnapshot(
    q, 
    (snap) => {
      if (snap.empty) {
        callback(null);
        return;
      }
      callback(snap.docs[0].data() as VitalsFeedback);
    },
    (error) => {
      console.warn('[VitalsFeedback] Subscription error (possibly offline):', error?.message || error);
      // Don't crash - just log the error and let the app continue
      // The cached data will still be available
    }
  );
};

export const generateAndSaveHourlyVitalsFeedback = async (userId: string): Promise<VitalsFeedback | null> => {
  const now = Date.now();
  return generateFeedbackForWindow(userId, now - 60 * 60 * 1000, now);
};

export const generateFeedbackFromLatestHour = async (userId: string): Promise<VitalsFeedback | null> => {
  console.log('[VitalsFeedback] Generating feedback from latest hour for user:', userId);
  
  try {
    const latestSnap = await getDocs(query(vitalsCollectionRef(userId), orderBy('timestamp', 'desc'), limit(1)));
    
    if (latestSnap.empty) {
      console.log('[VitalsFeedback] No vitals found, fetching latest feedback from cache...');
      return await fetchLatestFeedback(userId);
    }
    
    const latest = latestSnap.docs[0].data() as VitalsSample;
    const ts = latest.timestamp;
    const isSeconds = ts < 2_000_000_000; // heuristic: if timestamp < year 2033, it's in seconds
    const tsMs = isSeconds ? ts * 1000 : ts;
    
    // Calculate the current hour bucket
    const bucketStartMs = Math.floor(tsMs / (60 * 60 * 1000)) * 60 * 60 * 1000;
    const bucketEndMs = bucketStartMs + 60 * 60 * 1000;
    
    console.log('[VitalsFeedback] Latest vitals timestamp:', new Date(tsMs).toISOString());
    console.log('[VitalsFeedback] Hour bucket:', new Date(bucketStartMs).toISOString(), 'to', new Date(bucketEndMs).toISOString());
    
    return generateFeedbackForWindow(userId, bucketStartMs, bucketEndMs, isSeconds);
  } catch (error: any) {
    // Handle offline errors gracefully
    if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
      console.warn('[VitalsFeedback] Offline - attempting to use cached data');
      try {
        return await fetchLatestFeedback(userId);
      } catch (cacheError) {
        console.error('[VitalsFeedback] Failed to fetch cached feedback:', cacheError);
        return null;
      }
    }
    console.error('[VitalsFeedback] Error generating feedback:', error);
    throw error;
  }
};

const fetchWindowVitals = async (userId: string, windowStartMs: number, windowEndMs: number, isSeconds: boolean) => {
  console.log('[VitalsFeedback] Fetching vitals for window:', new Date(windowStartMs).toISOString(), 'to', new Date(windowEndMs).toISOString());
  
  const ranges = [
    { start: isSeconds ? windowStartMs / 1000 : windowStartMs, end: isSeconds ? windowEndMs / 1000 : windowEndMs },
    { start: windowStartMs, end: windowEndMs },
  ];
  const seen = new Set<string>();
  const docs: VitalsSample[] = [];
  
  for (const r of ranges) {
    try {
      console.log('[VitalsFeedback] Trying range:', r.start, 'to', r.end);
      
      const vitalsQuery = query(
        vitalsCollectionRef(userId),
        where('timestamp', '>=', r.start),
        where('timestamp', '<', r.end),
        orderBy('timestamp', 'desc'),
      );
      
      const snap = await getDocs(vitalsQuery);
      console.log('[VitalsFeedback] Found', snap.size, 'vitals in this range');
      
      snap.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          docs.push(d.data() as VitalsSample);
        }
      });
      
      if (docs.length > 0) {
        console.log('[VitalsFeedback] Total unique vitals found:', docs.length);
        break; // prefer first range with data
      }
    } catch (error: any) {
      console.warn('[VitalsFeedback] Error fetching range:', error?.message || error);
      // Continue to next range on error
    }
  }
  
  return docs;
};

const generateFeedbackForWindow = async (
  userId: string,
  windowStartMs: number,
  windowEndMs: number,
  isSeconds = false,
): Promise<VitalsFeedback | null> => {
  const hourBucket = Math.floor(windowStartMs / (60 * 60 * 1000)) * 60 * 60 * 1000;
  const vitalsDocs = await fetchWindowVitals(userId, windowStartMs, windowEndMs, isSeconds);

  console.log('[VitalsFeedback] Processing', vitalsDocs.length, 'vitals for feedback generation');

  if (vitalsDocs.length === 0) {
    console.log('[VitalsFeedback] No vitals in current window, checking for cached feedback...');
    const fallback = await fetchLatestFeedback(userId);
    if (fallback) {
      console.log('[VitalsFeedback] Returning cached feedback from:', new Date(fallback.windowStart).toISOString());
      return fallback;
    }
    
    console.log('[VitalsFeedback] No cached feedback, creating empty feedback');
    const emptyStats: Stats = {
      hr_avg: 0,
      hr_min: 0,
      hr_max: 0,
      bp_sys_avg: 0,
      bp_sys_min: 0,
      bp_sys_max: 0,
      bp_dia_avg: 0,
      bp_dia_min: 0,
      bp_dia_max: 0,
      spo2_avg: 0,
      spo2_min: 0,
      spo2_max: 0,
      temp_avg: undefined,
      temp_min: undefined,
      temp_max: undefined,
      hrv_avg: undefined,
      hrv_min: undefined,
      hrv_max: undefined,
      count: 0,
    };
    const fallbackFeedback: VitalsFeedback = {
      windowStart: hourBucket,
      windowEnd: windowEndMs,
      stats: emptyStats,
      riskLevel: 'stable',
      feedback: 'No new vitals in the last hour. Please sync your LifeBand to track your health.',
      modelVersion: 'heuristic',
      generatedAt: Date.now(),
    };
    await setDoc(doc(feedbackCollectionRef(userId), hourBucket.toString()), removeUndefined({
      ...fallbackFeedback,
      serverTimestamp: serverTimestamp(),
    }));
    return fallbackFeedback;
  }

  const stats = initialStats();
  vitalsDocs.forEach((v) => {
    stats.count += 1;
    if (typeof v.hr === 'number') {
      stats.hr_avg += v.hr;
      stats.hr_min = Math.min(stats.hr_min, v.hr);
      stats.hr_max = Math.max(stats.hr_max, v.hr);
    }
    if (typeof v.bp_sys === 'number') {
      stats.bp_sys_avg += v.bp_sys;
      stats.bp_sys_min = Math.min(stats.bp_sys_min, v.bp_sys);
      stats.bp_sys_max = Math.max(stats.bp_sys_max, v.bp_sys);
    }
    if (typeof v.bp_dia === 'number') {
      stats.bp_dia_avg += v.bp_dia;
      stats.bp_dia_min = Math.min(stats.bp_dia_min, v.bp_dia);
      stats.bp_dia_max = Math.max(stats.bp_dia_max, v.bp_dia);
    }
    if (typeof v.spo2 === 'number') {
      stats.spo2_avg += v.spo2;
      stats.spo2_min = Math.min(stats.spo2_min, v.spo2);
      stats.spo2_max = Math.max(stats.spo2_max, v.spo2);
    }
    if (typeof v.temp_c === 'number') {
      stats.temp_avg = (stats.temp_avg || 0) + v.temp_c;
      stats.temp_min = Math.min(stats.temp_min ?? v.temp_c, v.temp_c);
      stats.temp_max = Math.max(stats.temp_max ?? v.temp_c, v.temp_c);
    }
    if (typeof v.hrv === 'number') {
      stats.hrv_avg = (stats.hrv_avg || 0) + v.hrv;
      stats.hrv_min = Math.min(stats.hrv_min ?? v.hrv, v.hrv);
      stats.hrv_max = Math.max(stats.hrv_max ?? v.hrv, v.hrv);
    }
  });

  console.log('[VitalsFeedback] Computed raw stats:', stats);

  const finalized = finalizeStats(stats);
  if (!finalized) {
    console.log('[VitalsFeedback] Stats finalization failed, using fallback');
    const fallback = await fetchLatestFeedback(userId);
    if (fallback) return fallback;
    const emptyStats: Stats = {
      hr_avg: 0,
      hr_min: 0,
      hr_max: 0,
      bp_sys_avg: 0,
      bp_sys_min: 0,
      bp_sys_max: 0,
      bp_dia_avg: 0,
      bp_dia_min: 0,
      bp_dia_max: 0,
      spo2_avg: 0,
      spo2_min: 0,
      spo2_max: 0,
      temp_avg: undefined,
      temp_min: undefined,
      temp_max: undefined,
      hrv_avg: undefined,
      hrv_min: undefined,
      hrv_max: undefined,
      count: 0,
    };
    const fb: VitalsFeedback = {
      windowStart: hourBucket,
      windowEnd,
      stats: emptyStats,
      riskLevel: 'stable',
      feedback: 'No vitals available. Please sync your LifeBand to see feedback.',
      modelVersion: 'heuristic',
      generatedAt: Date.now(),
    };
    await setDoc(doc(feedbackCollectionRef(userId), hourBucket.toString()), removeUndefined({ ...fb, serverTimestamp: serverTimestamp() }));
    return fb;
  }

  const risk = computeRisk(finalized);
  const feedbackText = buildHeuristicFeedback(finalized, risk);

  console.log('[VitalsFeedback] Generated feedback - Risk:', risk, 'Stats:', finalized);

  const feedback: VitalsFeedback = {
    windowStart: hourBucket,
    windowEnd: windowEndMs,
    stats: finalized,
    riskLevel: risk,
    feedback: feedbackText,
    modelVersion: 'heuristic',
    generatedAt: Date.now(),
  };

  console.log('[VitalsFeedback] Saving feedback to Firestore...');
  try {
    await setDoc(doc(feedbackCollectionRef(userId), hourBucket.toString()), removeUndefined({
      ...feedback,
      serverTimestamp: serverTimestamp(),
    }));
    console.log('[VitalsFeedback] Feedback saved successfully');
  } catch (saveError: any) {
    console.warn('[VitalsFeedback] Failed to save feedback to Firestore (offline?):', saveError?.message);
    // Return the feedback even if save fails (for offline mode)
  }

  return feedback;
};

function buildHeuristicFeedback(stats: Stats, risk: VitalsFeedback['riskLevel']): string {
  const lines: string[] = [];
  const bpLine =
    stats.bp_sys_avg >= 140 || stats.bp_dia_avg >= 90
      ? `- BP about ${stats.bp_sys_avg}/${stats.bp_dia_avg}. Rest, hydrate, recheck in 10 minutes.`
      : `- BP about ${stats.bp_sys_avg}/${stats.bp_dia_avg}. Keep resting and stay hydrated.`;
  const spo2Line =
    stats.spo2_avg < 95
      ? `- SpO2 near ${stats.spo2_avg}%. Sit upright, breathe deeply; seek care if under 92%.`
      : `- SpO2 near ${stats.spo2_avg}%. Good oxygen; keep breathing steadily.`;
  const hrLine =
    stats.hr_avg > 110
      ? `- Heart rate about ${stats.hr_avg} bpm. Slow down and avoid stress.`
      : stats.hr_avg < 55
        ? `- Heart rate about ${stats.hr_avg} bpm. Rest and recheck soon.`
        : `- Heart rate about ${stats.hr_avg} bpm. Looking steady—stay calm.`;
  lines.push(bpLine);
  lines.push(spo2Line);
  lines.push(hrLine);
  lines.push("This is general information only. A pregnant woman must follow her doctor's advice.");
  return lines.join('\n');
}

