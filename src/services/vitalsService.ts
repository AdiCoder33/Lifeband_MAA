import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  query,
  limit,
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

export const saveVitalsSample = async (userId: string, sample: VitalsSample): Promise<void> => {
  await addDoc(vitalsCollectionRef(userId), {
    ...sample,
    timestamp: sample.timestamp || Date.now(),
    serverTimestamp: serverTimestamp(),
  } as any);
};

export const subscribeToLatestVitals = (
  userId: string,
  callback: (sample: VitalsSample | null) => void,
) => {
  const q = query(vitalsCollectionRef(userId), orderBy('timestamp', 'desc'), limit(1));
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    callback(snap.docs[0].data());
  });
};

export const subscribeToVitalsHistory = (
  userId: string,
  callback: (samples: VitalsSample[]) => void,
) => {
  const q = query(vitalsCollectionRef(userId), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data()));
  });
};
