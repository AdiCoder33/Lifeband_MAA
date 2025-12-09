import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Alert, ActivityIndicator } from 'react-native';
import { CameraView, BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { linkPatientToDoctor } from '../../services/doctorPatientService';
import { auth, firestore } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

const LinkDoctorScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    const data = result.data;
    try {
      const doctorId = data;
      const snap = await getDoc(doc(firestore, 'users', doctorId));
      if (!snap.exists() || (snap.data() as any).role !== 'doctor') {
        Alert.alert('Invalid QR Code', 'Please scan a valid doctor QR code.', [
          { text: 'Try Again', onPress: () => { setScanned(false); setLoading(false); } }
        ]);
        return;
      }
      const patientUid = auth.currentUser?.uid;
      if (!patientUid) {
        Alert.alert('Error', 'You must be logged in.');
        setScanned(false);
        setLoading(false);
        return;
      }
      await linkPatientToDoctor(patientUid, doctorId);
      setLoading(false);
      Alert.alert('Success! 🎉', 'Doctor linked successfully.', [
        { text: 'OK', onPress: () => setScanned(false) }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not link doctor.', [
        { text: 'Try Again', onPress: () => { setScanned(false); setLoading(false); } }
      ]);
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await requestPermission();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed to scan QR codes.');
      }
    })();
  }, []);

  if (!permission) {
    return (
      <ScreenContainer>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.info}>Loading camera...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenContainer>
        <View style={styles.container}>
          <Text style={styles.title}>📷 Camera Permission Required</Text>
          <Text style={styles.info}>We need camera access to scan your doctor's QR code.</Text>
          <Button title="Grant Permission" onPress={requestPermission} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <Text style={styles.title}>Link Your Doctor</Text>
        <Text style={styles.info}>Position the QR code within the frame</Text>
        <View style={styles.scannerWrapper}>
          {permission.granted && (
            <CameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ 
                barcodeTypes: ['qr'],
              }}
            />
          )}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.white} />
              <Text style={styles.loadingText}>Verifying...</Text>
            </View>
          )}
          <View style={styles.scanFrame}>
            <View style={styles.scanCorner} />
          </View>
        </View>
        <Text style={styles.hint}>💡 Make sure the QR code is well-lit and centered</Text>
        {scanned && !loading && (
          <Button 
            title="Scan Again" 
            variant="outline"
            onPress={() => setScanned(false)} 
            style={{ marginTop: spacing.md, marginHorizontal: spacing.lg }}
          />
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.lg,
  },
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
    marginBottom: spacing.lg,
    fontSize: typography.body,
  },
  scannerWrapper: {
    height: 400,
    marginHorizontal: spacing.lg,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  scanFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 250,
    height: 250,
    marginLeft: -125,
    marginTop: -125,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    backgroundColor: 'transparent',
  },
  scanCorner: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.white,
    borderTopLeftRadius: radii.lg,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.white,
    marginTop: spacing.md,
    fontSize: typography.body,
    fontWeight: '600',
  },
  hint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});

export default LinkDoctorScreen;
