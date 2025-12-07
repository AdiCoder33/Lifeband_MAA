import { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  FirestoreDataConverter,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { UserProfile, UserRole } from '../types/user';

const userProfileConverter: FirestoreDataConverter<UserProfile> = {
  toFirestore(profile: UserProfile) {
    return profile;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return data as UserProfile;
  },
};

const usersCollection = 'users';

export const createUserProfileFromAuth = async (
  user: User,
  role: UserRole,
  extra?: Partial<UserProfile>,
): Promise<UserProfile> => {
  const providerId = user.providerData[0]?.providerId;
  const googleId = providerId === 'google.com' ? user.providerData[0]?.uid : undefined;
  const profile: UserProfile = {
    uid: user.uid,
    name: extra?.name || user.displayName || '',
    email: user.email || '',
    role,
    authProvider: providerId === 'google.com' ? 'google' : 'password',
    onboardingCompleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
    ...(googleId ? { googleId } : {}),
  };

  await setDoc(doc(firestore, usersCollection, user.uid).withConverter(userProfileConverter), profile);
  return profile;
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await getDoc(doc(firestore, usersCollection, uid).withConverter(userProfileConverter));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data();
};

export const updateUserProfile = async (
  uid: string,
  data: Partial<UserProfile>,
): Promise<void> => {
  // Remove undefined values to prevent Firestore errors
  const cleanData = JSON.parse(JSON.stringify({ ...data, updatedAt: serverTimestamp() }));
  
  await updateDoc(doc(firestore, usersCollection, uid), cleanData);
};
