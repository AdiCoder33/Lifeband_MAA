import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert, Animated, PanResponder } from 'react-native';
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
  const [wasConnected, setWasConnected] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [suppressDisconnectAlert, setSuppressDisconnectAlert] = useState(false);
  const [showManualDevices, setShowManualDevices] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const slideAnim = new Animated.Value(0);

  useEffect(() => {
    reconnectIfKnownDevice();
  }, [reconnectIfKnownDevice]);

  // Monitor connection status and show alert on unexpected disconnection
  useEffect(() => {
    if (lifeBandState.connectionState === 'connected') {
      setWasConnected(true);
    } else if (lifeBandState.connectionState === 'disconnected' && wasConnected) {
      if (!suppressDisconnectAlert) {
        Alert.alert(
          'LifeBand Disconnected',
          lifeBandState.lastError 
            ? `Your LifeBand has been disconnected: ${lifeBandState.lastError}` 
            : 'Your LifeBand has been disconnected. Please reconnect to continue monitoring.',
          [{ text: 'OK' }]
        );
      }
      setSuppressDisconnectAlert(false);
      setWasConnected(false);
    }
  }, [lifeBandState.connectionState, lifeBandState.lastError, wasConnected, suppressDisconnectAlert]);

  const status = lifeBandState.connectionState;
  const deviceName = lifeBandState.device?.name || lifeBandState.device?.id || 'Unknown device';

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return '#4CAF50'; // Green
      case 'connecting':
      case 'scanning':
        return '#FFA000'; // Yellow/Orange
      case 'disconnected':
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Gray
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return '✓';
      case 'connecting':
      case 'scanning':
        return '◌';
      case 'disconnected':
        return '✕';
      default:
        return '?';
    }
  };

  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: false,
    }).start(() => {
      handleConnectToDevice(deviceId);
      setTimeout(() => {
        slideAnim.setValue(0);
        setSelectedDeviceId(null);
      }, 800);
    });
  };

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

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      setSuppressDisconnectAlert(true);
      await disconnect();
    } catch (error: any) {
      console.error('[LIFEBAND] Disconnect error:', error?.message || error);
      Alert.alert(
        'Disconnect Error',
        'Failed to disconnect from LifeBand. Please try again.',
        [{ text: 'OK' }]
      );
      setSuppressDisconnectAlert(false);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <ScreenContainer>
      <Text style={styles.title}>LifeBand Connection</Text>

      {/* Auto Connect Section */}
      <View style={styles.autoConnectCard}>
        <View style={styles.autoConnectHeader}>
          <Text style={styles.autoConnectTitle}>Auto Connect</Text>
          {connecting && <Text style={styles.loadingDot}>⏳</Text>}
        </View>

        {/* Status Indicator with Animation */}
        <View style={[styles.statusIndicator, { borderColor: getStatusColor() }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <View style={styles.statusContent}>
            <Text style={styles.statusLabel}>{status.toUpperCase()}</Text>
            {status === 'connected' && (
              <Text style={styles.statusValue}>{deviceName}</Text>
            )}
            {status === 'connecting' && (
              <Text style={styles.statusValue}>Searching for device...</Text>
            )}
            {status === 'disconnected' && lifeBandState.lastError && (
              <Text style={styles.statusError}>{lifeBandState.lastError}</Text>
            )}
          </View>
          <Text style={[styles.statusIcon, { color: getStatusColor() }]}>{getStatusIcon()}</Text>
        </View>

        <Text style={styles.hint}>Ensure your LifeBand is nearby and powered on</Text>

        {status !== 'connected' && (
          <TouchableOpacity 
            style={[styles.autoConnectButton, connecting && styles.autoConnectButtonLoading]}
            onPress={connectLifeBand}
            disabled={connecting}
            activeOpacity={0.7}
          >
            <Text style={styles.autoConnectButtonText}>
              {connecting ? 'Connecting...' : 'Start Auto Connect'}
            </Text>
          </TouchableOpacity>
        )}
        {status === 'connected' && (
          <TouchableOpacity 
            style={[styles.autoConnectButton, styles.autoConnectButtonDisconnect]}
            onPress={handleDisconnect}
            disabled={disconnecting}
            activeOpacity={0.7}
          >
            <Text style={styles.autoConnectButtonText}>
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Manual Connect Section */}
      <TouchableOpacity 
        style={styles.manualConnectHeader}
        onPress={() => {
          setShowManualDevices(!showManualDevices);
          if (!showManualDevices && devices.length === 0) {
            handleScan();
          }
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.manualConnectTitle}>Manual Selection</Text>
        <Text style={styles.expandIcon}>{showManualDevices ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {showManualDevices && (
        <View style={styles.manualConnectCard}>
          {scanning && (
            <View style={styles.scanningContainer}>
              <Text style={styles.scanningLoader}>⟳</Text>
              <Text style={styles.scanningText}>Scanning for devices...</Text>
            </View>
          )}

          {scanError && !scanning && (
            <Text style={styles.error}>{scanError}</Text>
          )}

          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            renderItem={({ item }) => {
              const isSelected = selectedDeviceId === item.id;
              const slideValue = isSelected ? slideAnim : new Animated.Value(0);
              
              return (
                <Animated.View
                  style={[
                    styles.deviceItem,
                    {
                      transform: [
                        {
                          translateX: slideValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 100],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.deviceRow}
                    onPress={() => handleSelectDevice(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>{item.name || 'Unnamed'}</Text>
                      <Text style={styles.meta}>MAC: {item.id}</Text>
                      <Text style={styles.meta}>RSSI: {item.rssi ?? '—'}</Text>
                    </View>

                    {isSelected && (
                      <Animated.View
                        style={[
                          styles.slideIndicator,
                          {
                            width: slideValue.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 40],
                            }),
                            backgroundColor: slideValue.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: ['#FFA000', '#4CAF50', '#4CAF50'],
                            }),
                          },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            }}
            ListEmptyComponent={
              !scanning ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No devices found</Text>
                  <TouchableOpacity 
                    style={styles.scanButton}
                    onPress={handleScan}
                    disabled={scanning}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.scanButtonText}>Scan Again</Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
          />
        </View>
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  autoConnectCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  autoConnectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  autoConnectTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  loadingDot: {
    fontSize: 20,
    color: colors.secondary,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  statusContent: {
    flex: 1,
  },
  statusLabel: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  statusValue: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  statusError: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.critical,
    marginTop: spacing.xs,
  },
  statusIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  hint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },
  autoConnectButton: {
    backgroundColor: colors.secondary,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  autoConnectButtonLoading: {
    opacity: 0.7,
  },
  autoConnectButtonDisconnect: {
    backgroundColor: colors.critical,
  },
  autoConnectButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body,
  },
  manualConnectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  manualConnectTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  expandIcon: {
    fontSize: 16,
    color: colors.secondary,
    fontWeight: '600',
  },
  manualConnectCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    maxHeight: 350,
  },
  scanningContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  scanningLoader: {
    fontSize: 40,
    marginBottom: spacing.md,
    color: colors.secondary,
  },
  scanningText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  error: {
    color: colors.critical,
    fontSize: typography.body,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  deviceItem: {
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(40, 53, 147, 0.04)',
    borderRadius: radii.md,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  meta: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: typography.small,
  },
  slideIndicator: {
    height: '100%',
    borderRadius: radii.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.body,
    marginBottom: spacing.md,
  },
  scanButton: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  scanButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: typography.body,
  },
});

export default LifeBandScreen;
