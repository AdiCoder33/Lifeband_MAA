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
let isCleaningUp = false; // Flag to prevent multiple simultaneous cleanups
let isConnecting = false; // Flag to prevent simultaneous connection attempts
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

const sendControlCommand = async (device: Device, command: string) => {
  try {
    await device.writeCharacteristicWithResponseForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_CONFIG_CHAR_UUID,
      base64.encode(command),
    );
    console.log(`[BLE] ${command} command sent successfully`);
  } catch (error) {
    console.warn(`[BLE] Failed to send ${command} command`);
    // Don't throw - this is a non-critical operation
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
    
    // Check if this is a hourly summary (different type)
    if (json.type === 'hourly_summary') {
      console.log('[PARSE] ✓ Hourly summary received:', json);
      // You can handle hourly summaries separately or store them differently
      // For now, we'll skip them in the vitals stream
      return null;
    }
    
    const normalizeTimestamp = (raw: any) => {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return Date.now();
      }
      let ts = numeric;
      if (ts < 10_000_000_000) {
        ts *= 1000; // assume seconds
      }
      const minReasonableEpoch = 1_577_836_800_000; // Jan 1 2020
      if (ts < minReasonableEpoch) {
        return Date.now();
      }
      return ts;
    };

    const sample: VitalsSample = {
      // Core vitals
      hr: Number(json.hr) || 0,
      bp_sys: Number(json.bp_sys) || 0,
      bp_dia: Number(json.bp_dia) || 0,
      spo2: json.spo2 !== undefined && json.spo2 !== null && json.spo2 > 0 ? Number(json.spo2) : undefined,
      hrv: json.hrv !== undefined ? Number(json.hrv) : undefined,
      ptt: json.ptt !== undefined ? Number(json.ptt) : undefined,
      ecg: json.ecg !== undefined ? Number(json.ecg) : undefined,
      ir: json.ir !== undefined ? Number(json.ir) : undefined,
      red: json.red !== undefined ? Number(json.red) : undefined,
      timestamp: normalizeTimestamp(json.timestamp),
      
      // Extended heart rate sources
      hr_ecg: json.hr_ecg !== undefined ? Number(json.hr_ecg) : undefined,
      hr_ppg: json.hr_ppg !== undefined ? Number(json.hr_ppg) : undefined,
      hr_source: json.hr_source,
      
      // Signal quality
      ecg_quality: json.ecg_quality !== undefined ? Number(json.ecg_quality) : undefined,
      ppg_quality: json.ppg_quality !== undefined ? Number(json.ppg_quality) : undefined,
      
      // BP method
      bp_method: json.bp_method,
      
      // HRV metrics
      hrv_sdnn: json.hrv_sdnn !== undefined ? Number(json.hrv_sdnn) : undefined,
      
      // AI: Arrhythmia Detection
      rhythm: json.rhythm,
      rhythm_confidence: json.rhythm_confidence !== undefined ? Number(json.rhythm_confidence) : undefined,
      arrhythmia_alert: json.arrhythmia_alert === true,
      
      // AI: Anemia Detection
      anemia_risk: json.anemia_risk,
      anemia_confidence: json.anemia_confidence !== undefined ? Number(json.anemia_confidence) : undefined,
      anemia_alert: json.anemia_alert === true,
      
      // AI: Preeclampsia Detection
      preeclampsia_risk: json.preeclampsia_risk,
      preeclampsia_confidence: json.preeclampsia_confidence !== undefined ? Number(json.preeclampsia_confidence) : undefined,
      preeclampsia_alert: json.preeclampsia_alert === true,
      
      // Overall maternal health
      maternal_health_score: json.maternal_health_score !== undefined ? Number(json.maternal_health_score) : undefined,
      
      // Buffered data flag
      buffered: json.buffered === true,
    };
    
    // Log critical alerts
    if (sample.arrhythmia_alert || sample.anemia_alert || sample.preeclampsia_alert) {
      console.warn('[PARSE] 🚨 CRITICAL ALERT DETECTED!');
      if (sample.arrhythmia_alert) {
        console.warn(`[PARSE] - Arrhythmia: ${sample.rhythm} (${sample.rhythm_confidence}% confidence)`);
      }
      if (sample.anemia_alert) {
        console.warn(`[PARSE] - Anemia Risk: ${sample.anemia_risk} (${sample.anemia_confidence}% confidence)`);
      }
      if (sample.preeclampsia_alert) {
        console.warn(`[PARSE] - Preeclampsia Risk: ${sample.preeclampsia_risk} (${sample.preeclampsia_confidence}% confidence)`);
      }
    }
    
    console.log('[PARSE] ✓ Parsed sample:', JSON.stringify(sample));
    return sample;
  } catch (error: any) {
    const errorMsg = error.reason || error.message || 'Parse error';
    console.error('[PARSE] Failed to parse vitals payload:', errorMsg);
    console.error('[PARSE] Raw payload:', value);
    return null;
  }
};

const cleanupNotification = () => {
  if (isCleaningUp) {
    console.log('[BLE] Cleanup already in progress, skipping');
    return;
  }
  
  if (notificationSub) {
    isCleaningUp = true;
    try {
      notificationSub.remove();
      console.log('[BLE] Notification subscription removed');
    } catch (error) {
      console.warn('[BLE] Cleanup notification error');
    } finally {
      notificationSub = null;
      isCleaningUp = false;
    }
  }
};

const waitForGracefulDisconnect = async (
  device: Device,
  timeoutMs = 4000,
  pollIntervalMs = 200,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stillConnected = await device.isConnected();
      if (!stillConnected) {
        console.log('[BLE] Device already disconnected by peripheral');
        return true;
      }
    } catch (error: any) {
      const errorMsg = error?.reason || error?.message || 'isConnected check failed';
      console.log('[BLE] Assuming disconnected after isConnected error:', errorMsg);
      return true;
    }
    await delay(pollIntervalMs);
  }
  console.log('[BLE] Device still connected after wait window');
  return false;
};

export const disconnectLifeBand = async (): Promise<void> => {
  console.log('[BLE] Disconnecting LifeBand...');
  
  // Store device reference before clearing
  const deviceToDisconnect = currentDevice;
  
  // Clear references immediately to prevent re-entry and new operations
  currentDevice = null;
  
  // Clean up notification subscription first
  try {
    cleanupNotification();
  } catch (error) {
    console.warn('[BLE] Cleanup during disconnect error');
  }

  if (!deviceToDisconnect) {
    console.log('[BLE] No active device to disconnect');
    return;
  }

  // Politely ask firmware to pause streaming before severing the link
  let gracefulDisconnect = false;
  try {
    const stillConnected = await deviceToDisconnect.isConnected();
    if (stillConnected) {
      try {
        await sendControlCommand(deviceToDisconnect, 'STOP');
        gracefulDisconnect = await waitForGracefulDisconnect(deviceToDisconnect);
        if (gracefulDisconnect) {
          console.log('[BLE] STOP command triggered firmware-side disconnect');
        }
      } catch (stopError: any) {
        // STOP command is non-critical, continue with manual disconnect
        console.log('[BLE] STOP command not sent, proceeding with manual disconnect');
      }
    } else {
      gracefulDisconnect = true;
      console.log('[BLE] Device already disconnected');
    }
  } catch (error: any) {
    // Can't check connection status, assume we need to disconnect
    console.log('[BLE] Cannot verify connection status, proceeding with disconnect');
  }

  if (!gracefulDisconnect) {
    // Try to disconnect through device first
    try {
      await deviceToDisconnect.cancelConnection();
      console.log('[BLE] Device cancelConnection() resolved');
      // Wait a bit for disconnect to propagate
      await delay(300);
    } catch (error) {
      console.log('[BLE] cancelConnection completed');
    }

    // Always try manager disconnect as backup to ensure cleanup
    if (manager) {
      try {
        await manager.cancelDeviceConnection(deviceToDisconnect.id);
        console.log('[BLE] Device disconnected via manager');
      } catch (error) {
        console.log('[BLE] Manager disconnect completed');
      }
    }
  } else {
    console.log('[BLE] Skipping manual cancel - disconnect already handled');
  }
  
  // Final cleanup - ensure all references are cleared
  currentDevice = null;
  isConnecting = false;
  console.log('[BLE] Disconnect sequence complete');
};

export const scanAndConnectToLifeBand = async (
  onStateChange: (state: LifeBandState) => void,
  onVitalsData: (sample: VitalsSample) => void,
): Promise<void> => {
  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    console.log('[BLE] Connection already in progress, skipping');
    return;
  }
  
  isConnecting = true;
  
  try {
    initBleManager();
    if (!manager) {
      onStateChange({ connectionState: 'disconnected', lastError: 'BLE Manager not initialized' });
      isConnecting = false;
      return;
    }
    await requestPermissions();
    onStateChange({ connectionState: 'scanning' });

    let strongest: Device | null = null;
    // Scan all devices (no UUID filter) so user can see any nearby device
    manager.startDeviceScan(null, null, async (error, device) => {
      if (error) {
        const errorMsg = error?.message || 'Scan failed';
        onStateChange({ connectionState: 'disconnected', lastError: errorMsg });
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
      isConnecting = false;
      return;
    }

    const strongestDevice = strongest as Device;
    console.log('[BLE] Connecting to:', strongestDevice.name, 'ID:', strongestDevice.id);
    onStateChange({ connectionState: 'connecting', device: { id: strongestDevice.id, name: strongestDevice.name } });

    // Clean up any existing connections first
    if (currentDevice && manager) {
      const oldDeviceId = currentDevice.id;
      currentDevice = null; // Clear reference first
      try {
        await manager.cancelDeviceConnection(oldDeviceId);
        console.log('[BLE] Cleaned up previous connection');
      } catch (e) {
        console.log('[BLE] Previous connection cleanup completed');
      }
    }
    
    const connected = await strongestDevice.connect({ 
      autoConnect: false,
      requestMTU: 512,
      timeout: 10000
    });
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
    
    // Clean up old subscription if exists
    cleanupNotification();
    
    notificationSub = connected.monitorCharacteristicForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_VITALS_CHAR_UUID,
      (error: any, characteristic: any) => {
        try {
          if (error) {
            const errorMsg = error.reason || error.message || 'Unknown notification error';
            console.warn('[BLE] Notification error:', errorMsg);
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
        } catch (callbackError: any) {
          const errorMsg = callbackError.reason || callbackError.message || 'Callback error';
          console.error('[BLE] Notification callback error:', errorMsg);
        }
      },
    );
    console.log('[BLE] Notification listener active');

    // Step 6: Wait for subscription to be active
    try {
      console.log('[BLE] Sending START command...');
      await connected.writeCharacteristicWithResponseForService(
        LIFEBAND_SERVICE_UUID,
        LIFEBAND_CONFIG_CHAR_UUID,
        base64.encode('START'),
      );
    } catch (writeError) {
      console.warn('[BLE] Failed to send START command, continuing anyway');
      // Don't fail the connection - ESP32 auto-enables notifications
    }

    // Monitor disconnection with safe error handling
    connected.onDisconnected((error) => {
      console.log('[BLE] onDisconnected triggered');
      
      // Perform all cleanup in try-catch to prevent crashes
      try {
        if (error) {
          console.log('[BLE] Device disconnected with error');
        } else {
          console.log('[BLE] Device disconnected');
        }
        
        // Clear device reference first to prevent new operations
        const wasCurrentDevice = currentDevice?.id === connected.id;
        if (wasCurrentDevice) {
          currentDevice = null;
        }
        
        // Safe cleanup - only if this was the current device
        if (wasCurrentDevice) {
          try {
            cleanupNotification();
          } catch (cleanupError: any) {
            console.warn('[BLE] Cleanup error in disconnect handler:', cleanupError?.message || cleanupError);
          }
        }
        
        // Safe state update - wrap in setTimeout to prevent state update during render
        setTimeout(() => {
          try {
            onStateChange({ 
              connectionState: 'disconnected', 
              lastError: error ? 'Connection lost' : undefined 
            });
          } catch (stateError: any) {
            console.warn('[BLE] State update error in disconnect handler:', stateError?.message || stateError);
          }
        }, 0);
      } catch (outerError: any) {
        // Catch-all to absolutely prevent crashes
        console.error('[BLE] Critical error in disconnect handler:', outerError?.message || outerError);
      }
    });

    onStateChange({ connectionState: 'connected', device: { id: connected.id, name: connected.name } });
    console.log('[BLE] ✓✓✓ Connection fully established ✓✓✓');
  } catch (error: any) {
    const errorMsg = error?.message || 'Connection failed';
    console.error('[BLE] Connection failed:', errorMsg);
    
    // Clean up on error
    const deviceToCleanup = currentDevice;
    currentDevice = null; // Clear reference first
    
    cleanupNotification();
    
    if (deviceToCleanup && manager) {
      try {
        await manager.cancelDeviceConnection(deviceToCleanup.id);
      } catch {
        // Ignore cleanup errors
      }
    }
    
    onStateChange({ connectionState: 'disconnected', lastError: errorMsg });
  } finally {
    isConnecting = false; // Always reset connection flag
  }
};

export const reconnectLifeBandById = async (
  deviceId: string,
  onStateChange: (state: LifeBandState) => void,
  onVitalsData: (sample: VitalsSample) => void,
): Promise<void> => {
  // Prevent multiple simultaneous reconnection attempts
  if (isConnecting) {
    console.log('[BLE] Reconnection already in progress, skipping');
    onStateChange({ connectionState: 'connecting', device: { id: deviceId } });
    return;
  }
  
  // Check if already connected to this device
  if (currentDevice) {
    try {
      const isConnected = await currentDevice.isConnected();
      if (isConnected && currentDevice.id === deviceId) {
        console.log('[BLE] Already connected to this device');
        onStateChange({ connectionState: 'connected', device: { id: deviceId, name: currentDevice.name } });
        return;
      }
    } catch (e) {
      console.log('[BLE] Device connection check failed, proceeding with reconnect');
    }
  }
  
  isConnecting = true;
  
  try {
    initBleManager();
    if (!manager) {
      onStateChange({ connectionState: 'disconnected', lastError: 'BLE Manager not initialized' });
      isConnecting = false;
      return;
    }
    await requestPermissions();
    onStateChange({ connectionState: 'connecting', device: { id: deviceId } });

    console.log('[BLE] Reconnecting to device ID:', deviceId);
    
    // Clean up any existing connections first
    if (currentDevice && manager) {
      const oldDeviceId = currentDevice.id;
      currentDevice = null; // Clear reference first
      try {
        await manager.cancelDeviceConnection(oldDeviceId);
        console.log('[BLE] Cleaned up previous connection');
      } catch (e) {
        console.log('[BLE] Previous connection cleanup completed');
      }
    }
    
    const device = await manager.connectToDevice(deviceId, { 
      autoConnect: false,
      requestMTU: 512,
      timeout: 10000
    });
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
    
    // Clean up old subscription if exists
    cleanupNotification();
    
    notificationSub = device.monitorCharacteristicForService(
      LIFEBAND_SERVICE_UUID,
      LIFEBAND_VITALS_CHAR_UUID,
      (error, characteristic) => {
        try {
          if (error) {
            const errorMsg = error.reason || error.message || 'Unknown notification error';
            console.warn('[BLE] Notification error:', errorMsg);
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
        } catch (callbackError: any) {
          const errorMsg = callbackError.reason || callbackError.message || 'Callback error';
          console.error('[BLE] Notification callback error:', errorMsg);
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
      const errorMsg = writeError.reason || writeError.message || 'Unknown error';
      console.warn('[BLE] Failed to send START command:', errorMsg);
    }

    // Monitor disconnection with safe error handling
    device.onDisconnected((error) => {
      console.log('[BLE] onDisconnected triggered (reconnect path)');
      
      // Perform all cleanup in try-catch to prevent crashes
      try {
        const errorMsg = error?.reason || error?.message || 'User disconnected';
        console.log('[BLE] Device disconnected:', errorMsg);
        
        // Clear device reference first to prevent new operations
        const wasCurrentDevice = currentDevice?.id === device.id;
        if (wasCurrentDevice) {
          currentDevice = null;
        }
        
        // Safe cleanup - only if this was the current device
        if (wasCurrentDevice) {
          try {
            cleanupNotification();
          } catch (cleanupError: any) {
            console.warn('[BLE] Cleanup error in disconnect handler:', cleanupError?.message || cleanupError);
          }
        }
        
        // Safe state update - wrap in setTimeout to prevent state update during render
        setTimeout(() => {
          try {
            onStateChange({ 
              connectionState: 'disconnected', 
              lastError: error ? 'Connection lost' : undefined 
            });
          } catch (stateError: any) {
            console.warn('[BLE] State update error in disconnect handler:', stateError?.message || stateError);
          }
        }, 0);
      } catch (outerError: any) {
        // Catch-all to absolutely prevent crashes
        console.error('[BLE] Critical error in disconnect handler:', outerError?.message || outerError);
      }
    });

    onStateChange({ connectionState: 'connected', device: { id: device.id, name: device.name } });
    console.log('[BLE] ✓✓✓ Reconnection fully established ✓✓✓');
  } catch (error: any) {
    const errorMsg = error?.reason || error?.message || 'Reconnection failed';
    console.error('[BLE] Reconnection failed:', errorMsg);
    
    // Clean up on error
    const deviceToCleanup = currentDevice;
    currentDevice = null; // Clear reference first
    
    cleanupNotification();
    
    if (deviceToCleanup && manager) {
      try {
        await manager.cancelDeviceConnection(deviceToCleanup.id);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    onStateChange({ connectionState: 'disconnected', lastError: errorMsg });
  } finally {
    isConnecting = false; // Always reset connection flag
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
