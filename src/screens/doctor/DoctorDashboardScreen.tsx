import React, { useCallback, useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity, FlatList, Linking, Image } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth, firestore } from '../../services/firebase';
import { subscribeDoctorAppointments } from '../../services/appointmentService';
import { Appointment } from '../../types/appointment';
import { collection, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DoctorStackParamList } from '../../types/navigation';
import { UserProfile } from '../../types/user';
import { format } from 'date-fns';
import { subscribeToLatestVitals } from '../../services/vitalsService';
import { VitalsSample } from '../../types/vitals';
import { shadows } from '../../theme/theme';
import { signOutUser } from '../../services/authService';

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorHome'> & {
  profile?: UserProfile | null;
};

type PatientSummaryEntry = {
  profile: UserProfile;
  vitals: VitalsSample | null;
};

type RiskEntry = {
  profile: UserProfile;
  issues: string[];
  score: number;
  lastReading: number;
};

type ActiveEntry = {
  profile: UserProfile;
  lastReading: number;
};

const toMillis = (timestamp?: number) => {
  if (!timestamp) return 0;
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '—';
  const asMs = timestamp > 2_000_000_000 ? timestamp : timestamp * 1000;
  return format(new Date(asMs), 'HH:mm');
};

const getGreeting = () => {
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 5 && hour < 12) {
    return {
      greeting: 'Good Morning',
      caption: "Start your day empowering mothers and babies with care."
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      greeting: 'Good Afternoon',
      caption: "Your dedication brings health and hope to families."
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      greeting: 'Good Evening',
      caption: "Review the day's insights and prepare for tomorrow."
    };
  } else {
    return {
      greeting: 'Good Night',
      caption: "Rest well, Doctor. Your patients are in good hands."
    };
  }
};

const DoctorDashboardScreen: React.FC<Props> = ({ navigation, profile }) => {
  const uid = auth.currentUser?.uid;
  const [patientCount, setPatientCount] = useState(0);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [nextAppointments, setNextAppointments] = useState<Appointment[]>([]);
  const [patientSummaries, setPatientSummaries] = useState<PatientSummaryEntry[]>([]);
  const [patientProfiles, setPatientProfiles] = useState<Record<string, UserProfile>>({});
  const patientUnsubs = useRef<Record<string, () => void>>({});

  const patientPages = useMemo(() => {
    const chunkSize = 10;
    const pages: typeof patientSummaries[] = [];
    for (let i = 0; i < patientSummaries.length; i += chunkSize) {
      pages.push(patientSummaries.slice(i, i + chunkSize));
    }
    return pages;
  }, [patientSummaries]);

  const riskPatients = useMemo<RiskEntry[]>(() => {
    return patientSummaries
      .map((entry) => {
        if (!entry.vitals) return null;
        const { bp_sys, bp_dia, spo2, hr, timestamp } = entry.vitals;
        const issues: string[] = [];
        let score = 0;
        if (bp_sys >= 140 || bp_dia >= 90) {
          issues.push(`BP ${bp_sys}/${bp_dia}`);
          score += 2;
        }
        if (typeof spo2 === 'number' && spo2 < 95) {
          issues.push(`SpO₂ ${spo2}%`);
          score += 3;
        }
        if (hr >= 110) {
          issues.push(`HR ${hr} bpm`);
          score += 1;
        }
        if (!issues.length) return null;
        return {
          profile: entry.profile,
          issues,
          score,
          lastReading: toMillis(timestamp),
        } as RiskEntry;
      })
      .filter((entry): entry is RiskEntry => entry !== null)
      .sort((a, b) => (b.score - a.score) || (b.lastReading - a.lastReading))
      .slice(0, 3);
  }, [patientSummaries]);

  const activePatients = useMemo<ActiveEntry[]>(() => {
    if (!patientSummaries.length) return [];
    const ranked = patientSummaries
      .map((entry) => ({
        profile: entry.profile,
        lastReading: entry.vitals ? toMillis(entry.vitals.timestamp) : 0,
      }))
      .sort((a, b) => b.lastReading - a.lastReading);

    const recent = ranked.filter((item) => item.lastReading > 0).slice(0, 3);
    if (recent.length >= 3) {
      return recent;
    }
    const remainderNeeded = 3 - recent.length;
    const fallback = ranked.filter((item) => item.lastReading === 0).slice(0, remainderNeeded);
    return [...recent, ...fallback];
  }, [patientSummaries]);

  const handleSignOut = useCallback(async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOutUser();
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Please try again.';
              Alert.alert('Sign out failed', message);
            }
          },
        },
      ],
    );
  }, []);

  const handleReviewPatient = useCallback(() => {
    navigation.navigate('DoctorPatients');
  }, [navigation]);

  const handleMessagePatient = useCallback((patient: UserProfile) => {
    if (!patient.email) {
      Alert.alert('Missing email', `Add an email address for ${patient.name} to send a message.`);
      return;
    }
    Linking.openURL(`mailto:${encodeURIComponent(patient.email)}`).catch(() =>
      Alert.alert('Unable to compose email', 'Please try again from your mail app.'),
    );
  }, []);

  const handleCallPatient = useCallback((patient: UserProfile) => {
    const phone = (patient as any)?.phoneNumber || (patient as any)?.phone;
    if (!phone) {
      Alert.alert('Missing number', `Add a phone number for ${patient.name} to place a call.`);
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Unable to start call', 'Please try again from your dialer.'),
    );
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionButton} onPress={() => navigation.navigate('DoctorQR')}>
            <Image 
              source={require('../../../assets/QRCode.png')} 
              style={styles.headerQRImage}
              resizeMode="contain"
            />
            <Text style={styles.headerActionLabel}>Share QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerSignOut} onPress={handleSignOut}>
            <Image 
              source={require('../../../assets/Logout.png')} 
              style={styles.headerLogoutImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handleSignOut]);

  useEffect(() => {
    // no-op: patients handled in combined effect below
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeDoctorAppointments(uid, async (appts) => {
      const now = Date.now();
      
      // Filter and convert appointments properly
      const upcomingFiltered = appts.filter((a) => {
        if (a.status !== 'upcoming') return false;
        
        // Convert Timestamp to milliseconds
        let appointmentTime: number;
        if ((a.scheduledAt as any)?.toMillis) {
          appointmentTime = (a.scheduledAt as any).toMillis();
        } else if ((a.scheduledAt as any)?.toDate) {
          appointmentTime = (a.scheduledAt as any).toDate().getTime();
        } else if (a.scheduledAt instanceof Date) {
          appointmentTime = a.scheduledAt.getTime();
        } else {
          appointmentTime = Number(a.scheduledAt);
        }
        
        return appointmentTime >= now;
      });
      
      setUpcoming(upcomingFiltered);
      
      // Sort by scheduled time (earliest first)
      const sorted = [...upcomingFiltered].sort((a, b) => {
        const getTime = (appt: Appointment) => {
          if ((appt.scheduledAt as any)?.toMillis) {
            return (appt.scheduledAt as any).toMillis();
          } else if ((appt.scheduledAt as any)?.toDate) {
            return (appt.scheduledAt as any).toDate().getTime();
          } else if (appt.scheduledAt instanceof Date) {
            return appt.scheduledAt.getTime();
          }
          return Number(appt.scheduledAt);
        };
        return getTime(a) - getTime(b);
      });
      
      const nextThree = sorted.slice(0, 3);
      setNextAppointments(nextThree);
      
      // Load patient profiles for appointments
      const profiles: Record<string, UserProfile> = {};
      for (const appt of nextThree) {
        if (appt.patientId && !profiles[appt.patientId]) {
          try {
            const psnap = await getDoc(doc(firestore, 'users', appt.patientId));
            if (psnap.exists()) {
              profiles[appt.patientId] = psnap.data() as UserProfile;
            }
          } catch (e) {
            console.error('Error loading patient profile:', e);
          }
        }
      }
      setPatientProfiles(profiles);
    });
    return () => unsub();
  }, [uid]);

  // Subscribe to patients and their latest vitals
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(firestore, 'users', uid, 'patients'), async (snap) => {
      // cleanup old listeners
      Object.values(patientUnsubs.current).forEach((u) => u && u());
      patientUnsubs.current = {};

      if (snap.empty) {
        setPatientSummaries([]);
        setPatientCount(0);
        return;
      }

      const patientIds: string[] = [];
      const profiles: Record<string, UserProfile> = {};

      // First, get all patient profiles
      for (const d of snap.docs) {
        const patientId = (d.data() as any).patientId;
        if (!patientId) continue;
        
        const psnap = await getDoc(doc(firestore, 'users', patientId));
        if (!psnap.exists()) continue;
        
        const profile = psnap.data() as UserProfile;
        profiles[patientId] = profile;
        patientIds.push(patientId);
        
        // Initialize with null vitals
        setPatientSummaries((prev) => {
          const existing = prev.find(p => p.profile.uid === patientId);
          if (existing) return prev;
          return [...prev, { profile, vitals: null }];
        });

        // Subscribe to real-time vitals updates for this patient
        const unsubVitals = subscribeToLatestVitals(patientId, (sample) => {
          console.log(`[DOCTOR DASHBOARD] Received vitals for patient ${patientId}:`, sample?.hr, sample?.timestamp);
          setPatientSummaries((prev) => {
            const other = prev.filter((p) => p.profile.uid !== patientId);
            return [...other, { profile, vitals: sample }].sort((a, b) => 
              a.profile.name.localeCompare(b.profile.name)
            );
          });
        });
        patientUnsubs.current[patientId] = unsubVitals;
      }

      // Remove patients that are no longer linked
      setPatientSummaries((prev) => 
        prev.filter(p => patientIds.includes(p.profile.uid))
      );
      setPatientCount(patientIds.length);
    });
    
    return () => {
      unsub();
      Object.values(patientUnsubs.current).forEach((u) => u && u());
    };
  }, [uid]);

  const { greeting, caption } = getGreeting();

  return (
    <ScreenContainer scrollable>
      <View style={styles.heroCard}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>{greeting}, Dr. {profile?.name || 'Doctor'}</Text>
          <Text style={styles.heroSubtitle}>{profile?.doctorData?.hospital || 'Your clinic'}</Text>
          <Text style={styles.heroCaption}>{caption}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Image 
            source={require('../../../assets/Doctor.png')} 
            style={styles.heroProfileImage}
            resizeMode="cover"
          />
        </View>
      </View>

        {riskPatients.length > 0 && (
          <View style={[styles.cardFull, styles.alertCard]}>
            <View style={styles.alertHeader}>
              <Text style={styles.cardTitle}>Critical Alerts</Text>
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>{riskPatients.length}</Text>
              </View>
            </View>
            {riskPatients.map((entry, index) => (
              <View
                key={entry.profile.uid}
                style={[styles.alertRow, index === riskPatients.length - 1 && styles.rowLast]}
              >
                <View style={styles.alertInfo}>
                  <Text style={styles.alertName}>{entry.profile.name}</Text>
                  <Text style={styles.alertMeta}>{entry.issues.join(' · ')}</Text>
                </View>
                <TouchableOpacity style={styles.alertAction} onPress={handleReviewPatient}>
                  <Text style={styles.alertActionText}>Review</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.alertFooter}>Flagged when vitals cross safe thresholds so you can prioritise outreach.</Text>
          </View>
        )}

        {activePatients.length > 0 && (
          <View style={[styles.cardFull, styles.contactCard]}>
            <Text style={styles.cardTitle}>Quick Connect</Text>
            <Text style={styles.cardCopy}>Reach out to the patients with the freshest readings.</Text>
            {activePatients.map((entry, index) => (
              <View
                key={entry.profile.uid}
                style={[styles.contactRow, index === activePatients.length - 1 && styles.rowLast]}
              >
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{entry.profile.name}</Text>
                  <Text style={styles.contactMeta}>
                    {entry.lastReading
                      ? `Last reading ${format(new Date(entry.lastReading), 'MMM d, HH:mm')}`
                      : 'Awaiting first reading'}
                  </Text>
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity
                    style={styles.contactButton}
                    onPress={() => handleMessagePatient(entry.profile)}
                  >
                    <Text style={styles.contactButtonIcon}>✉️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.contactButton, styles.contactButtonAccent]}
                    onPress={() => handleCallPatient(entry.profile)}
                  >
                    <Text style={styles.contactButtonIcon}>📞</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

      <View style={styles.cardRow}>
        <TouchableOpacity style={[styles.statCard, styles.card]} onPress={() => navigation.navigate('DoctorPatients')}>
          <View style={styles.statIconCircle}>
            <Text style={styles.statIcon}>👥</Text>
          </View>
          <Text style={styles.cardLabel}>Patients</Text>
          <Text style={styles.cardValue}>{patientCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCardUpcoming, styles.card]} onPress={() => navigation.navigate('DoctorAppointments')}>
          <View style={[styles.statIconCircle, styles.statIconCircleUpcoming]}>
            <Text style={styles.statIcon}>📅</Text>
          </View>
          <Text style={styles.cardLabel}>Upcoming</Text>
          <Text style={styles.cardValue}>{upcoming.length}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.cardFull, styles.cardAppointments]}>
        <View style={styles.appointmentHeader}>
          <View>
            <Text style={styles.cardTitle}>Next Appointments</Text>
            <Text style={styles.cardSubtitle}>Your upcoming consultations</Text>
          </View>
          <TouchableOpacity 
            style={styles.createAppointmentButton}
            onPress={() => navigation.navigate('DoctorCreateAppointment')}
          >
            <Text style={styles.createAppointmentIcon}>➕</Text>
          </TouchableOpacity>
        </View>
        {nextAppointments.length === 0 ? (
          <View style={styles.emptyAppointment}>
            <Text style={styles.emptyAppointmentIcon}>📅</Text>
            <Text style={styles.emptyAppointmentText}>No upcoming appointments</Text>
            <Text style={styles.emptyAppointmentHint}>Create new appointments to manage your schedule</Text>
          </View>
        ) : (
          <>
            {nextAppointments.map((a, index) => {
              // Convert Timestamp to Date properly
              let appointmentDate: Date;
              if ((a.scheduledAt as any)?.toDate) {
                appointmentDate = (a.scheduledAt as any).toDate();
              } else if (a.scheduledAt instanceof Date) {
                appointmentDate = a.scheduledAt;
              } else {
                appointmentDate = new Date(Number(a.scheduledAt));
              }
              
              const patientName = patientProfiles[a.patientId]?.name || 'Patient';
              return (
                <TouchableOpacity 
                  key={a.id} 
                  style={[styles.appointmentCard, index === nextAppointments.length - 1 && styles.appointmentCardLast]}
                  onPress={() => navigation.navigate('DoctorAppointmentDetail', { appointmentId: a.id! })}
                  activeOpacity={0.7}
                >
                  <View style={styles.appointmentDateBadge}>
                    <Text style={styles.appointmentMonth}>{format(appointmentDate, 'MMM')}</Text>
                    <Text style={styles.appointmentDay}>{format(appointmentDate, 'd')}</Text>
                  </View>
                  <View style={styles.appointmentDetails}>
                    <Text style={styles.appointmentPatient}>{patientName}</Text>
                    <Text style={styles.appointmentReason}>{a.reason || 'Consultation'}</Text>
                    <Text style={styles.appointmentTime}>🕐 {format(appointmentDate, 'HH:mm')}</Text>
                  </View>
                  <View style={styles.appointmentAction}>
                    <Text style={styles.appointmentActionIcon}>→</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
        <TouchableOpacity 
          style={styles.viewAllButtonCompact}
          onPress={() => navigation.navigate('DoctorAppointments')}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllButtonText}>View All</Text>
          <Text style={styles.viewAllButtonArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.cardFull, styles.cardPatientsVitals]}>
        <Text style={styles.cardTitle}>Patients & Vitals</Text>
        <Text style={styles.cardCopy}>Monitor vitals from all your linked patients at a glance.</Text>
        {patientSummaries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>👥</Text>
            <Text style={styles.emptyStateText}>No linked patients yet</Text>
            <Text style={styles.emptyStateHint}>Share your QR code to connect with patients</Text>
          </View>
        ) : (
          <View style={styles.tableContainer}>
            <FlatList
              data={patientPages}
              keyExtractor={(_, idx) => `page-${idx}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              renderItem={({ item: page }) => {
                // Sort page to show high/medium risk first, then normal
                const sortedPage = [...page].sort((a, b) => {
                  const getRiskScore = (patient: typeof a) => {
                    if (!patient.vitals) return -1;
                    let score = 0;
                    
                    // High risk conditions
                    if (patient.vitals.arrhythmia_alert) score += 10;
                    if (patient.vitals.anemia_alert) score += 10;
                    if (patient.vitals.preeclampsia_alert) score += 10;
                    if (patient.vitals.anemia_risk === 'Critical' || patient.vitals.anemia_risk === 'High') score += 8;
                    if (patient.vitals.preeclampsia_risk === 'Critical' || patient.vitals.preeclampsia_risk === 'High') score += 8;
                    
                    // Medium risk conditions
                    if (patient.vitals.anemia_risk === 'Moderate') score += 4;
                    if (patient.vitals.preeclampsia_risk === 'Moderate') score += 4;
                    if (patient.vitals.rhythm && patient.vitals.rhythm !== 'Normal') score += 3;
                    
                    return score;
                  };
                  
                  return getRiskScore(b) - getRiskScore(a);
                });
                
                // Take top 3 patients
                const displayPatients = sortedPage.slice(0, 3);
                
                return (
                <View style={styles.tablePage}>
                  <View style={styles.tableHeader}>
                    <View style={styles.cellName}>
                      <Text style={styles.headerCell}>Patient</Text>
                    </View>
                    <View style={styles.cellVital}>
                      <Text style={styles.headerCell}>HR</Text>
                    </View>
                    <View style={styles.cellVital}>
                      <Text style={styles.headerCell}>BP</Text>
                    </View>
                    <View style={styles.cellVital}>
                      <Text style={styles.headerCell}>SpO₂</Text>
                    </View>
                    <View style={styles.cellStatus}>
                      <Text style={styles.headerCell}>Status</Text>
                    </View>
                  </View>
                  {displayPatients.map((p, idx) => {
                    // Check all conditions from vitals data with severity levels
                    let statusText = 'Normal';
                    let statusColor = colors.healthy;
                    let severity = 0; // 0=normal, 1=medium, 2=high
                    
                    if (!p.vitals) {
                      statusText = 'No Data';
                      statusColor = colors.muted;
                    } else {
                      const highConditions: string[] = [];
                      const mediumConditions: string[] = [];
                      
                      // High severity checks
                      if (p.vitals.arrhythmia_alert) {
                        highConditions.push('Arrhythmia');
                      }
                      if (p.vitals.anemia_alert) {
                        highConditions.push('Anemia');
                      }
                      if (p.vitals.preeclampsia_alert) {
                        highConditions.push('Preeclampsia');
                      }
                      if (p.vitals.anemia_risk === 'Critical' || p.vitals.anemia_risk === 'High') {
                        highConditions.push(`${p.vitals.anemia_risk} Anemia`);
                      }
                      if (p.vitals.preeclampsia_risk === 'Critical' || p.vitals.preeclampsia_risk === 'High') {
                        highConditions.push(`${p.vitals.preeclampsia_risk} Preeclampsia`);
                      }
                      
                      // Medium severity checks
                      if (p.vitals.anemia_risk === 'Moderate') {
                        mediumConditions.push('Moderate Anemia');
                      }
                      if (p.vitals.preeclampsia_risk === 'Moderate') {
                        mediumConditions.push('Moderate Preeclampsia');
                      }
                      if (p.vitals.rhythm && p.vitals.rhythm !== 'Normal' && !p.vitals.arrhythmia_alert) {
                        mediumConditions.push(p.vitals.rhythm);
                      }
                      
                      // Determine status priority: High > Medium > Normal
                      if (highConditions.length > 0) {
                        statusText = highConditions[0];
                        statusColor = colors.critical; // Red
                        severity = 2;
                      } else if (mediumConditions.length > 0) {
                        statusText = mediumConditions[0];
                        statusColor = colors.attention; // Orange
                        severity = 1;
                      }
                    }
                    
                    // Determine row background color based on severity
                    let rowBackgroundColor = '#F1F8F4'; // Light green for normal
                    if (!p.vitals) {
                      rowBackgroundColor = '#F5F5F5'; // Light gray for no data
                    } else if (severity === 2) {
                      rowBackgroundColor = '#FFEBEE'; // Light red for high risk
                    } else if (severity === 1) {
                      rowBackgroundColor = '#FFF4E5'; // Light orange for medium risk
                    }
                    
                    return (
                    <View key={p.profile.uid} style={[styles.tableRow, idx === displayPatients.length - 1 && styles.tableRowLast, { backgroundColor: rowBackgroundColor }]}>
                      <View style={styles.cellName}>
                        <Text style={styles.patientName} numberOfLines={1}>{p.profile.name}</Text>
                        <Text style={styles.patientMeta} numberOfLines={1}>
                          {p.vitals ? formatTime(p.vitals.timestamp) : 'No data'}
                        </Text>
                      </View>
                      <View style={styles.cellVital}>
                        <Text style={styles.cellValue}>
                          {p.vitals ? `${p.vitals.hr}` : '—'}
                        </Text>
                        <Text style={styles.cellUnit}>bpm</Text>
                      </View>
                      <View style={styles.cellVital}>
                        <Text style={styles.cellValue}>
                          {p.vitals ? `${p.vitals.bp_sys}/${p.vitals.bp_dia}` : '—'}
                        </Text>
                        <Text style={styles.cellUnit}>mmHg</Text>
                      </View>
                      <View style={styles.cellVital}>
                        <Text style={styles.cellValue}>
                          {typeof p.vitals?.spo2 === 'number' ? `${p.vitals.spo2}%` : '—'}
                        </Text>
                      </View>
                      <View style={styles.cellStatus}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                          <Text style={styles.statusBadgeText}>{statusText}</Text>
                        </View>
                      </View>
                    </View>
                  )})}
                </View>
              )}}
            />
            {patientPages.length > 1 && (
              <View style={styles.paginationHint}>
                <Text style={styles.paginationText}>← Swipe to see more patients →</Text>
              </View>
            )}
          </View>
        )}
        <TouchableOpacity
          style={styles.viewAllButtonCompact}
          onPress={() => navigation.navigate('DoctorPatients')}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllButtonText}>View All</Text>
          <Text style={styles.viewAllButtonArrow}>→</Text>
        </TouchableOpacity>
      </View>

    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  heroCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  heroTextBlock: {
    flex: 1,
    marginRight: spacing.md,
  },
  heroTitle: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    color: '#FDF0F0',
    marginBottom: spacing.xs,
  },
  heroCaption: {
    color: '#FFE5E5',
    fontSize: typography.small,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroProfileImage: {
    width: 64,
    height: 64,
  },
  heroIcon: {
    fontSize: 28,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginLeft: spacing.xs,
  },
  headerSignOut: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    marginLeft: spacing.xs,
  },
  headerActionIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  headerQRImage: {
    width: 16,
    height: 16,
    marginRight: spacing.xs,
    transform: [{ scale: 2.5 }],
  },
  headerActionLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerActionLabelAlt: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.white,
  },
  headerLogoutImage: {
    width: 24,
    height: 24,
    transform: [{ scale: 1.8 }],
  },
  alertCard: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: 'rgba(211, 47, 47, 0.2)',
    borderLeftWidth: 4,
    borderLeftColor: colors.critical,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  alertBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.critical,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.critical,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  alertBadgeText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: typography.body,
  },
  alertRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211, 47, 47, 0.12)',
  },
  alertInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  alertName: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  alertMeta: {
    color: colors.critical,
    fontSize: typography.small,
    marginTop: 2,
  },
  alertAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.critical,
  },
  alertActionText: {
    color: colors.critical,
    fontWeight: '700',
    fontSize: typography.small,
  },
  alertFooter: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
  contactCard: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: 'rgba(77, 182, 172, 0.2)',
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(40, 53, 147, 0.12)',
  },
  contactInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  contactName: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  contactMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
  },
  contactButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  contactButtonAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  contactButtonIcon: {
    fontSize: 18,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  subtitle: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statCard: {
    backgroundColor: '#FDECEE',
    alignItems: 'center',
  },
  statCardUpcoming: {
    backgroundColor: '#E8F5F3',
    alignItems: 'center',
  },
  statCardAlt: {
    backgroundColor: '#EFE9FF',
    alignItems: 'center',
  },
  statIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(229, 115, 115, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statIconCircleUpcoming: {
    backgroundColor: 'rgba(77, 182, 172, 0.25)',
  },
  statIconCircleAlt: {
    backgroundColor: 'rgba(40, 53, 147, 0.15)',
  },
  statIcon: {
    fontSize: 24,
  },
  cardLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardLabelWhite: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: typography.small,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardValue: {
    fontSize: typography.heading + 8,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  cardValueWhite: {
    fontSize: typography.heading + 8,
    fontWeight: '900',
    color: colors.white,
    marginTop: spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardFull: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    marginBottom: spacing.xs,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardCopy: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  cardAppointments: {
    backgroundColor: colors.white,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  createAppointmentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  createAppointmentIcon: {
    fontSize: 18,
    color: colors.white,
  },
  emptyAppointment: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyAppointmentIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyAppointmentText: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyAppointmentHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FFFE',
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(77, 182, 172, 0.2)',
  },
  appointmentCardLast: {
    marginBottom: spacing.md,
  },
  appointmentDateBadge: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  appointmentMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  appointmentDay: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 22,
  },
  appointmentDetails: {
    flex: 1,
  },
  appointmentPatient: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  appointmentReason: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  appointmentTime: {
    fontSize: typography.small,
    color: colors.accent,
    fontWeight: '600',
  },
  appointmentAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(77, 182, 172, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentActionIcon: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: 'bold',
  },
  viewAllButton: {
    marginTop: spacing.xs,
  },
  viewAllButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'flex-end',
    backgroundColor: colors.secondary,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
    minWidth: 100,
  },
  viewAllButtonText: {
    fontSize: typography.small + 1,
    fontWeight: '700',
    color: colors.white,
    marginRight: spacing.xs,
  },
  viewAllButtonArrow: {
    fontSize: 16,
    color: colors.white,
    fontWeight: 'bold',
  },
  cardPatientsVitals: {
    backgroundColor: colors.white,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyStateHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tableContainer: {
    marginTop: spacing.sm,
  },
  tablePage: {
    width: 520,
  },
  apptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  apptTime: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  apptReason: {
    color: colors.textSecondary,
  },
  buttonSpace: {
    marginTop: spacing.sm,
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#E0E0E0',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    backgroundColor: 'rgba(229, 115, 115, 0.08)',
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 115, 115, 0.1)',
    backgroundColor: colors.white,
  },
  tableRowLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
  },
  headerCell: {
    fontWeight: '700',
    fontSize: typography.small - 1,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellName: {
    flex: 0.6,
    paddingRight: spacing.xs,
  },
  cellVital: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellStatus: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellValue: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cellUnit: {
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    minWidth: 50,
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  patientName: {
    fontWeight: '700',
    fontSize: typography.small,
    color: colors.textPrimary,
    marginBottom: 1,
  },
  patientMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  paginationHint: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  paginationText: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  patientVitals: {
    alignItems: 'flex-end',
  },
});

export default DoctorDashboardScreen;

