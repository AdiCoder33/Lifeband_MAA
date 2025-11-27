import { UserProfile } from '../types/user';

export const calculatePregnancyProgress = (patientData?: UserProfile['patientData']) => {
  if (!patientData) return null;
  const now = new Date();
  let startDate: Date | null = null;
  if (patientData.lmpDate) {
    startDate = new Date(patientData.lmpDate);
  } else if (patientData.eddDate) {
    const edd = new Date(patientData.eddDate);
    startDate = new Date(edd.getTime() - 280 * 24 * 60 * 60 * 1000);
  }
  if (!startDate) return null;
  const diffMs = now.getTime() - startDate.getTime();
  const weeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  const months = Math.floor(weeks / 4);
  return { weeks, months };
};
