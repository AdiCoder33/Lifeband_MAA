import { doc, serverTimestamp, setDoc, updateDoc, getDoc, collection, getDocs, FirestoreDataConverter } from 'firebase/firestore';
import { firestore } from './firebase';
import { DoctorPatientLink } from '../types/doctor';
import { UserProfile } from '../types/user';

const doctorPatientConverter: FirestoreDataConverter<DoctorPatientLink> = {
  toFirestore(link: DoctorPatientLink) {
    return link;
  },
  fromFirestore(snapshot) {
    return snapshot.data() as DoctorPatientLink;
  },
};

export const linkPatientToDoctor = async (patientUid: string, doctorUid: string): Promise<void> => {
  // Update patient doc
  await updateDoc(doc(firestore, 'users', patientUid), {
    doctorId: doctorUid,
    doctorLinkedAt: serverTimestamp(),
  });

  // Create link under doctor subcollection
  await setDoc(
    doc(firestore, 'users', doctorUid, 'patients', patientUid).withConverter(doctorPatientConverter),
    {
      patientId: patientUid,
      linkedAt: serverTimestamp(),
    },
  );
};

export const getDoctorPatients = async (doctorUid: string): Promise<DoctorPatientLink[]> => {
  const snap = await getDocs(collection(firestore, 'users', doctorUid, 'patients').withConverter(doctorPatientConverter));
  return snap.docs.map((d) => d.data());
};

export const getDoctorForPatient = async (patientUid: string): Promise<UserProfile | null> => {
  const patientDoc = await getDoc(doc(firestore, 'users', patientUid));
  if (!patientDoc.exists()) return null;
  const doctorId = (patientDoc.data() as any).doctorId;
  if (!doctorId) return null;
  const docSnap = await getDoc(doc(firestore, 'users', doctorId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as UserProfile;
};
