import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import base64 from 'react-native-base64';
import { Platform, PermissionsAndroid } from 'react-native';
import { VitalsSample } from '../types/vitals';
import { Buffer } from 'buffer';

export type BleConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';

export interface BleDeviceInfo {
  id: string;
  name?: string | null;
  rssi?: number | null;
}

export interface LifeBandState {
  connectionState: BleConnectionState;
  device?: BleDeviceInfo;
  lastError?: string;
}

// Sample UUIDs for development. Update to match the final ESP32 firmware.
export const LIFEBAND_SERVICE_UUID = 'c0de0001-73f3-4b4c-8f61-1aa7a6d5beef';
export const LIFEBAND_VITALS_CHAR_UUID = 'c0de0002-73f3-4b4c-8f61-1aa7a6d5beef'; // Notify
export const LIFEBAND_CONFIG_CHAR_UUID = 'c0de0003-73f3-4b4c-8f61-1aa7a6d5beef'; // Write (START/STOP)
export const LIFEBAND_DEVICE_NAME = 'LIFEBAND-S3';

let manager: BleManager | null = null;
let notificationSub: Subscription | null = null;
let currentDevice: Device | null = null;

export const initBleManager = () => {
  if (!manager) {
    manager = new BleManager();
  }
};

const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 31) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    } else {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
  }
};

const parseVitalsPayload = (value?: string | null): VitalsSample | null => {
  if (!value) {
    console.warn('[PARSE] Empty payload received');
    return null;
  }
  try {
    console.log('[PARSE] Raw payload length:', value.length);
    
    // Try to parse as direct JSON first (new firmware sends raw JSON)
    let jsonString: string;
    try {
      // Attempt to parse directly as JSON
      const testParse = JSON.parse(value);
      jsonString = value;
      console.log('[PARSE] Received raw JSON (new format)');
    } catch {
      // If that fails, try base64 decoding (old format)
      console.log('[PARSE] Attempting base64 decode (old format)');
      jsonString = Buffer.from(value, 'base64').toString('utf8');
    }
    
    console.log('[PARSE] JSON string:', jsonString);
    const json = JSON.parse(jsonString);
    
    const sample: VitalsSample = {
      hr: Number(json.hr) || 0,
      bp_sys: Number(json.bp_sys) || 0,
      bp_dia: Number(json.bp_dia) || 0,
      spo2: json.spo2 !== undefined && json.spo2 !== null && json.spo2 > 0 ? Number(json.spo2) : undefined,
      hrv: json.hrv !== undefined ? Number(json.hrv) : undefined,
      ptt: json.ptt !== undefined ? Number(json.ptt) : undefined,
      ecg: json.ecg !== undefined ? Number(json.ecg) : undefined,
      ir: json.ir !== undefined ? Number(json.ir) : undefined,
      timestamp: Date.now(),
    };
    console.log('[PARSE] ✓ Parsed sample:', JSON.stringify(sample));
    return sample;
  } catch (error) {
    console.error('[PARSE] Failed to parse vitals payload:', error);
    console.error('[PARSE] Raw payload:', value);
    return null;
  }
};

const cleanupNotification = () => {
  try {
    if (notificationSub) {
      notificationSub.remove();
      notificationSub = null;
    }
  } catch (error) {
    console.warn('Cleanup notification error:', error);
    notificationSub = null;
  }
};

export const disconnectLifeBand = async (): Promise<void> => {
  cleanupNotification();
  if (currentDevice) {
    try {
      await currentDevice.cancelConnection();
    } catch (error) {
      console.warn('disconnect error', error);
    }
    currentDevice = null;
  }
};

export const scanAndConnectToLifeBand = async (
  onStateChange: (state: LifeBandState) => void,
  onVitalsData: (sample: VitalsSample) => void,
): Promise<void> => {
  initBleManager();
  if (!manager) return;
  await requestPermissions();
  onStateChange({ connectionState: 'scanning' });

  let strongest: Device | null = null;
  // Scan all devices (no UUID filter) so user can see any nearby device
  manager.startDeviceScan(null, null, async (error, device) => {
    if (error) {
      onStateChange({ connectionState: 'disconnected', lastError: error.message });
      manager?.stopDeviceScan();
      return;
    }
    if (device && (device.name === LIFEBAND_DEVICE_NAME || device.name?.startsWith('LIFEBAND-') || device.serviceUUIDs?.includes(LIFEBAND_SERVICE_UUID))) {
      if (!strongest || (device.rssi || -100) > (strongest.rssi || -100)) {
        strongest = device;
      }
    }
  });

  // Wait briefly to collect candidates
  await new Promise((resolve) => setTimeout(resolve, 4000));
  manager.stopDeviceScan();

  if (!strongest) {
    onStateChange({ connectionState: 'disconnected', lastError: 'No LifeBand found nearby.' });
    return;
  }

  const strongestDevice = strongest as Device;
  console.log('[BLE] Connecting to:', strongestDevice.name, 'ID:', strongestDevice.id);
  onStateChange({ connectionState: 'connecting', device: { id: strongestDevice.id, name: strongestDevice.name } });

  try {
    const connected = await strongestDevice.connect();
    console.log('[BLE] Physical connection established');
    currentDevice = connected;
    
    // Step 1: Discover services
    console.log('[BLE] Discovering services and characteristics...');
    await connected.discoverAllServicesAndCharacteristics();
    console.log('[BLE] Services discovered');
    
    // Step 2: Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Request MTU for larger packets
    try {
      const mtu = await connected.requestMTU(512);
      console.log('[BLE] MTU set to:', mtu);
    } catch (mtuError) {
      console.warn('[BLE] MTU request failed, using default');
    }

    // Step 4: Wait after MTU negotiation
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 5: Subscribe to vitals notifications FIRST
    console.log('[BLE] Setting up vitals notification listener...');
    notificationSub = connected.monitorCharacteristicForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_VITALS_CHAR_UUID,
      (error: any, characteristic: any) => {
        if (error) {
          console.warn('[BLE] Notification error:', error.message || error);
          return;
        }
        if (!characteristic?.value) {
          console.warn('[BLE] Received notification with no value');
          return;
        }
        console.log('[BLE] ✓ Notification received from vitals characteristic');
        const sample = parseVitalsPayload(characteristic.value);
        if (sample) {
          console.log('[BLE] ✓ Successfully parsed vitals notification');
          onVitalsData(sample);
        } else {
          console.warn('[BLE] ✗ Failed to parse vitals');
        }
      },
    );
    console.log('[BLE] Notification listener active');

    // Step 6: Wait for subscription to be active
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 7: NOW send START command with response
    try {
      console.log('[BLE] Sending START command...');
      await connected.writeCharacteristicWithResponseForService(
        LIFEBAND_SERVICE_UUID,
        LIFEBAND_CONFIG_CHAR_UUID,
        base64.encode('START'),
      );
      console.log('[BLE] ✓ START command sent successfully');
    } catch (writeError: any) {
      console.warn('[BLE] Failed to send START command:', writeError.message);
      // Don't fail the connection - ESP32 auto-enables notifications
    }

    // Monitor disconnection
    connected.onDisconnected((error) => {
      console.log('[BLE] Device disconnected:', error?.message || 'User disconnected');
      cleanupNotification();
      currentDevice = null;
      onStateChange({ connectionState: 'disconnected', lastError: error ? 'Connection lost' : undefined });
    });

    onStateChange({ connectionState: 'connected', device: { id: connected.id, name: connected.name } });
    console.log('[BLE] ✓✓✓ Connection fully established ✓✓✓');
  } catch (error: any) {
    console.error('[BLE] Connection failed:', error.message);
    onStateChange({ connectionState: 'disconnected', lastError: error.message });
    cleanupNotification();
    currentDevice = null;
  }
};

export const reconnectLifeBandById = async (
  deviceId: string,
  onStateChange: (state: LifeBandState) => void,
  onVitalsData: (sample: VitalsSample) => void,
): Promise<void> => {
  initBleManager();
  if (!manager) return;
  await requestPermissions();
  onStateChange({ connectionState: 'connecting', device: { id: deviceId } });

  try {
    console.log('[BLE] Reconnecting to device ID:', deviceId);
    const device = await manager.connectToDevice(deviceId);
    console.log('[BLE] Physical reconnection established');
    currentDevice = device;
    
    // Discover services
    console.log('[BLE] Discovering services...');
    await device.discoverAllServicesAndCharacteristics();
    console.log('[BLE] Services discovered');
    
    // Wait for services
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Request MTU
    try {
      const mtu = await device.requestMTU(512);
      console.log('[BLE] MTU set to:', mtu);
    } catch (mtuError) {
      console.warn('[BLE] MTU request failed, using default');
    }

    // Wait after MTU
    await new Promise(resolve => setTimeout(resolve, 500));

    // Subscribe to notifications
    console.log('[BLE] Setting up notification listener...');
    notificationSub = device.monitorCharacteristicForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_VITALS_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          console.warn('[BLE] Notification error:', error.message || error);
          return;
        }
        if (!characteristic?.value) {
          console.warn('[BLE] Received notification with no value');
          return;
        }
        console.log('[BLE] ✓ Notification received');
        const sample = parseVitalsPayload(characteristic.value);
        if (sample) {
          console.log('[BLE] ✓ Successfully parsed vitals');
          onVitalsData(sample);
        } else {
          console.warn('[BLE] ✗ Failed to parse vitals');
        }
      },
    );
    console.log('[BLE] Notification listener active');

    // Wait for subscription
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send START command
    try {
      console.log('[BLE] Sending START command...');
      await device.writeCharacteristicWithResponseForService(
        LIFEBAND_SERVICE_UUID,
        LIFEBAND_CONFIG_CHAR_UUID,
        base64.encode('START'),
      );
      console.log('[BLE] ✓ START command sent successfully');
    } catch (writeError: any) {
      console.warn('[BLE] Failed to send START command:', writeError.message);
    }

    device.onDisconnected((error) => {
      console.log('[BLE] Device disconnected:', error?.message || 'User disconnected');
      cleanupNotification();
      currentDevice = null;
      onStateChange({ connectionState: 'disconnected', lastError: error ? 'Connection lost' : undefined });
    });

    onStateChange({ connectionState: 'connected', device: { id: device.id, name: device.name } });
    console.log('[BLE] ✓✓✓ Reconnection fully established ✓✓✓');
  } catch (error: any) {
    console.error('[BLE] Reconnection failed:', error.message);
    onStateChange({ connectionState: 'disconnected', lastError: error.message });
    cleanupNotification();
    currentDevice = null;
  }
};

type LifeBandSample = VitalsSample;

export async function connectToNearestLifeBand(
  manager: BleManager,
  onVitals: (sample: LifeBandSample) => void,
): Promise<{ device: Device; stop: () => void }> {
  await manager.enable();

  return new Promise((resolve, reject) => {
    const stateSub = manager.onStateChange((state) => {
      if (state !== 'PoweredOn') {
        return;
      }
      stateSub.remove();
      manager.startDeviceScan([LIFEBAND_SERVICE_UUID], null, async (error, scannedDevice) => {
        if (error) {
          manager.stopDeviceScan();
          reject(error);
          return;
        }
        if (!scannedDevice || scannedDevice.name !== LIFEBAND_DEVICE_NAME) {
          return;
        }
        manager.stopDeviceScan();
        try {
          const device = await scannedDevice.connect();
          await device.discoverAllServicesAndCharacteristics();

          const startPayload = Buffer.from('START', 'utf8').toString('base64');
          await device.writeCharacteristicWithResponseForService(
            LIFEBAND_SERVICE_UUID,
            LIFEBAND_CONFIG_CHAR_UUID,
            startPayload,
          );

          const monitorSub = device.monitorCharacteristicForService(
            LIFEBAND_SERVICE_UUID,
            LIFEBAND_VITALS_CHAR_UUID,
            (monitorError, characteristic) => {
              if (monitorError || !characteristic?.value) {
                return;
              }
              try {
                const json = Buffer.from(characteristic.value, 'base64').toString('utf8');
                const sample = JSON.parse(json) as LifeBandSample;
                onVitals(sample);
              } catch (parseError) {
                console.warn('Failed to parse vitals payload', parseError);
              }
            },
          );

          resolve({
            device,
            stop: () => {
              monitorSub.remove?.();
              device.cancelConnection().catch(() => {});
            },
          });
        } catch (connectError) {
          reject(connectError);
        }
      });
    }, true);
  });
}
export const scanForDevices = async (durationMs = 5000): Promise<BleDeviceInfo[]> => {
  initBleManager();
  if (!manager) return [];
  await requestPermissions();
  const found: Record<string, BleDeviceInfo> = {};

  return new Promise((resolve) => {
    manager!.startDeviceScan(null, null, (error, device) => {
      if (error) {
        manager?.stopDeviceScan();
        resolve(Object.values(found));
        return;
      }
      if (device) {
        found[device.id] = {
          id: device.id,
          name: device.name,
          rssi: device.rssi,
        };
      }
    });

    setTimeout(() => {
      manager?.stopDeviceScan();
      resolve(Object.values(found));
    }, durationMs);
  });
};
