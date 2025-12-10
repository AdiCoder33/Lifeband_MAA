import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  query,
  limit,
  doc,
  setDoc,
  FirestoreDataConverter,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { VitalsSample } from '../types/vitals';

const vitalsConverter: FirestoreDataConverter<VitalsSample> = {
  toFirestore(sample: VitalsSample) {
    return sample;
  },
  fromFirestore(snapshot) {
    return snapshot.data() as VitalsSample;
  },
};

const vitalsCollectionRef = (userId: string) =>
  collection(firestore, 'users', userId, 'vitals').withConverter(vitalsConverter);

const vitalsDocRef = (userId: string, bucketStart: number) =>
  doc(firestore, 'users', userId, 'vitals', bucketStart.toString()).withConverter(vitalsConverter);

export const saveVitalsSample = async (userId: string, sample: VitalsSample): Promise<void> => {
  try {
    // Filter out undefined fields to prevent Firestore validation errors
    const cleanedSample = Object.fromEntries(
      Object.entries(sample).filter(([_, value]) => value !== undefined)
    );
    
    await addDoc(vitalsCollectionRef(userId), {
      ...cleanedSample,
      timestamp: sample.timestamp || Date.now(),
      serverTimestamp: serverTimestamp(),
    } as any);
  } catch (error: any) {
    if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
      console.warn('[VitalsService] Offline - vitals will be saved when connection restored');
      // Firestore will automatically retry when connection is restored
    } else {
      console.error('[VitalsService] Error saving vitals:', error);
      throw error;
    }
  }
};

export const saveAggregatedVitalsSample = async (
  userId: string,
  bucketStart: number,
  sample: VitalsSample,
): Promise<void> => {
  try {
    const cleanedSample = Object.fromEntries(
      Object.entries(sample).filter(([_, value]) => value !== undefined)
    );

    await setDoc(
      vitalsDocRef(userId, bucketStart),
      {
        ...cleanedSample,
        timestamp: bucketStart,
        bucketStart,
        serverTimestamp: serverTimestamp(),
      } as any,
      { merge: true },
    );
  } catch (error: any) {
    if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
      console.warn('[VitalsService] Offline - aggregated vitals will be saved when connection restored');
      // Firestore will automatically retry when connection is restored
    } else {
      console.error('[VitalsService] Error saving aggregated vitals:', error);
      throw error;
    }
  }
};

export const subscribeToLatestVitals = (
  userId: string,
  callback: (sample: VitalsSample | null) => void,
) => {
  const q = query(vitalsCollectionRef(userId), orderBy('timestamp', 'desc'), limit(1));
  return onSnapshot(
    q,
    { includeMetadataChanges: false }, // Only trigger on actual data changes, not metadata
    (snap) => {
      if (snap.empty) {
        callback(null);
        return;
      }
      callback(snap.docs[0].data());
    },
    (error) => {
      console.error('Error in vitals subscription:', error);
      callback(null);
    }
  );
};

export const subscribeToVitalsHistory = (
  userId: string,
  callback: (samples: VitalsSample[]) => void,
  options: { maxEntries?: number } = {},
) => {
  const { maxEntries = 336 } = options; // ~7 days of 30-min buckets
  const q = query(vitalsCollectionRef(userId), orderBy('timestamp', 'desc'), limit(maxEntries));
  return onSnapshot(
    q, 
    (snap) => {
      callback(snap.docs.map((d) => d.data()));
    },
    (error) => {
      console.warn('[VitalsService] History subscription error (possibly offline):', error?.message || error);
      // Don't crash - cached data will still be available
    }
  );
};
