import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { CameraView, BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import ScreenContainer from '../../components/ScreenContainer';
import { colors, spacing, typography } from '../../theme/theme';
import { linkPatientToDoctor } from '../../services/doctorPatientService';
import { auth, firestore } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

const LinkDoctorScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    const data = result.data;
    try {
      const doctorId = data;
      const snap = await getDoc(doc(firestore, 'users', doctorId));
      if (!snap.exists() || (snap.data() as any).role !== 'doctor') {
        Alert.alert('Invalid doctor code', 'Please ask your doctor to share their QR again.');
        setScanned(false);
        return;
      }
      const patientUid = auth.currentUser?.uid;
      if (!patientUid) return;
      await linkPatientToDoctor(patientUid, doctorId);
      Alert.alert('Linked', 'Doctor linked successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not link doctor.');
      setScanned(false);
    }
  };

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <ScreenContainer>
        <Text style={styles.info}>Requesting camera permission...</Text>
      </ScreenContainer>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenContainer>
        <Text style={styles.info}>Camera permission is required to scan QR.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Link Your Doctor</Text>
      <Text style={styles.info}>Scan your doctor's QR code to link.</Text>
      <View style={styles.scannerWrapper}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  info: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  scannerWrapper: {
    height: 320,
    margin: spacing.lg,
    borderRadius: 16,
    overflow: 'hidden',
  },
});

export default LinkDoctorScreen;
