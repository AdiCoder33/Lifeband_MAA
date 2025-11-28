import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { useLifeBand } from '../../context/LifeBandContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PatientStackParamList } from '../../types/navigation';
import { BleDeviceInfo, scanForDevices } from '../../services/bleService';

type Props = NativeStackScreenProps<PatientStackParamList, 'LifeBand'>;

const LifeBandScreen: React.FC<Props> = () => {
  const { lifeBandState, connecting, connectLifeBand, connectToDevice, disconnect, reconnectIfKnownDevice } = useLifeBand();
  const [devices, setDevices] = useState<BleDeviceInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    reconnectIfKnownDevice();
  }, [reconnectIfKnownDevice]);

  const status = lifeBandState.connectionState;
  const deviceName = lifeBandState.device?.name || lifeBandState.device?.id || 'Unknown device';

  const handleScan = async () => {
    try {
      setScanError(null);
      setScanning(true);
      const found = await scanForDevices(6000);
      setDevices(found);
      if (found.length === 0) {
        setScanError('No devices found nearby.');
      }
    } catch (error: any) {
      setScanError(error?.message || 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const handleConnectToDevice = async (id: string) => {
    await connectToDevice(id);
  };

  return (
    <ScreenContainer>
      <Text style={styles.title}>LifeBand</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.status}>{status.toUpperCase()}</Text>
        {lifeBandState.lastError ? <Text style={styles.error}>{lifeBandState.lastError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device</Text>
        <Text style={styles.body}>{lifeBandState.device ? deviceName : 'Not linked yet'}</Text>
        <Text style={styles.helper}>Keep the band nearby to connect.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nearby Devices</Text>
        {scanError ? <Text style={styles.error}>{scanError}</Text> : null}
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.deviceRow} onPress={() => handleConnectToDevice(item.id)}>
              <Text style={styles.deviceName}>{item.name || 'Unnamed device'}</Text>
              <Text style={styles.meta}>RSSI: {item.rssi ?? '—'}</Text>
              <Text style={styles.metaSmall}>{item.id}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.meta}>Tap Scan to find devices.</Text>}
        />
      </View>

      <View style={styles.actions}>
        {status === 'connected' ? (
          <Button title="Disconnect" onPress={disconnect} loading={connecting} />
        ) : (
          <>
            <Button title="Scan" onPress={handleScan} loading={scanning} />
            <Button title="Auto Connect" onPress={connectLifeBand} loading={connecting} />
          </>
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 0,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    marginBottom: spacing.xs,
    color: colors.textPrimary,
  },
  status: {
    fontWeight: '800',
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  body: {
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  helper: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  error: {
    marginTop: spacing.xs,
    color: colors.critical,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  deviceRow: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#E0E0E0',
  },
  deviceName: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metaSmall: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  meta: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});

export default LifeBandScreen;
