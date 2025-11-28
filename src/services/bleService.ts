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
export const LIFEBAND_DEVICE_NAME = 'LIFEBAND-MAA-ESP32';

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
  if (!value) return null;
  try {
    const decoded = base64.decode(value);
    const json = JSON.parse(decoded);
    const sample: VitalsSample = {
      hr: Number(json.hr),
      bp_sys: Number(json.bp_sys),
      bp_dia: Number(json.bp_dia),
      hrv: Number(json.hrv),
      timestamp: Number(json.timestamp),
    };
    return sample;
  } catch (error) {
    console.warn('Failed to parse vitals payload', error);
    return null;
  }
};

const cleanupNotification = () => {
  if (notificationSub) {
    notificationSub.remove?.();
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
    if (device && (device.name?.startsWith('LIFEBAND-MAA-') || device.serviceUUIDs?.includes(LIFEBAND_SERVICE_UUID))) {
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
  onStateChange({ connectionState: 'connecting', device: { id: strongestDevice.id, name: strongestDevice.name } });

  try {
    const connected = await strongestDevice.connect();
    currentDevice = connected;
    await connected.discoverAllServicesAndCharacteristics();

    // Subscribe to vitals notifications
    notificationSub = connected.monitorCharacteristicForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_VITALS_CHAR_UUID,
      (error: any, characteristic: any) => {
        if (error) {
          onStateChange({ connectionState: 'connected', device: { id: connected.id, name: connected.name }, lastError: error.message });
          return;
        }
        const sample = parseVitalsPayload(characteristic?.value);
        if (sample) {
          onVitalsData(sample);
        }
      },
    );

    // Send START command
    await connected.writeCharacteristicWithoutResponseForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_CONFIG_CHAR_UUID,
      base64.encode('START'),
    );

    onStateChange({ connectionState: 'connected', device: { id: connected.id, name: connected.name } });
  } catch (error: any) {
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
    const device = await manager.connectToDevice(deviceId);
    currentDevice = device;
    await device.discoverAllServicesAndCharacteristics();

    notificationSub = device.monitorCharacteristicForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_VITALS_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          onStateChange({ connectionState: 'connected', device: { id: device.id, name: device.name }, lastError: error.message });
          return;
        }
        const sample = parseVitalsPayload(characteristic?.value);
        if (sample) {
          onVitalsData(sample);
        }
      },
    );

    await device.writeCharacteristicWithoutResponseForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_CONFIG_CHAR_UUID,
      base64.encode('START'),
    );

    onStateChange({ connectionState: 'connected', device: { id: device.id, name: device.name } });
  } catch (error: any) {
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
