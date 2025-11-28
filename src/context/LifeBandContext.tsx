import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import { saveVitalsSample, subscribeToLatestVitals } from '../services/vitalsService';
import {
  BleConnectionState,
  LifeBandState,
  scanAndConnectToLifeBand,
  disconnectLifeBand,
  reconnectLifeBandById,
} from '../services/bleService';
import { VitalsSample } from '../types/vitals';
import { updateUserProfile } from '../services/userService';

type LifeBandContextValue = {
  lifeBandState: LifeBandState;
  latestVitals: VitalsSample | null;
  connecting: boolean;
  connectLifeBand: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnectIfKnownDevice: () => Promise<void>;
  connectToDevice: (deviceId: string) => Promise<void>;
};

const LifeBandContext = createContext<LifeBandContextValue | undefined>(undefined);
const DEVICE_KEY = 'lifeband_device_id';

export const LifeBandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lifeBandState, setLifeBandState] = useState<LifeBandState>({ connectionState: 'disconnected' });
  const [latestVitals, setLatestVitals] = useState<VitalsSample | null>(null);
  const [connecting, setConnecting] = useState(false);
  const latestSubRef = useRef<(() => void) | undefined>(undefined);

  const uid = auth.currentUser?.uid;

  // Subscribe to latest vitals in Firestore to sync UI even if app restarts
  useEffect(() => {
    if (!uid) return;
    latestSubRef.current?.();
    latestSubRef.current = subscribeToLatestVitals(uid, (sample) => setLatestVitals(sample));
    return () => latestSubRef.current?.();
  }, [uid]);

  const persistDevice = useCallback(
    async (deviceId: string, deviceName?: string | null) => {
      await AsyncStorage.setItem(DEVICE_KEY, deviceId);
      if (uid) {
        await updateUserProfile(uid, {
          lifeBandDevice: {
            deviceId,
            deviceName,
            linkedAt: new Date() as any,
          },
        } as any);
      }
    },
    [uid],
  );

  const handleVitals = useCallback(
    async (sample: VitalsSample) => {
      setLatestVitals(sample);
      if (uid) {
        await saveVitalsSample(uid, sample);
      }
    },
    [uid],
  );

  const connectLifeBand = useCallback(async () => {
    if (lifeBandState.connectionState === 'connected' || connecting) {
      return;
    }
    setConnecting(true);
    await scanAndConnectToLifeBand(
      (state) => {
        setLifeBandState(state);
        if (state.connectionState === 'connected' && state.device) {
          persistDevice(state.device.id, state.device.name);
        }
      },
      handleVitals,
    );
    setConnecting(false);
  }, [handleVitals, persistDevice]);

  const disconnect = useCallback(async () => {
    await disconnectLifeBand();
    setLifeBandState({ connectionState: 'disconnected' });
  }, []);

  const reconnectIfKnownDevice = useCallback(async () => {
    const savedId = await AsyncStorage.getItem(DEVICE_KEY);
    if (!savedId) return;
    setConnecting(true);
    await reconnectLifeBandById(
      savedId,
      (state) => {
        setLifeBandState(state);
      },
      handleVitals,
    );
    setConnecting(false);
  }, [handleVitals]);

  const connectToDevice = useCallback(
    async (deviceId: string) => {
      if (lifeBandState.connectionState === 'connected' || connecting) {
        return;
      }
      setConnecting(true);
      await reconnectLifeBandById(
        deviceId,
        (state) => {
          setLifeBandState(state);
          if (state.connectionState === 'connected' && state.device) {
            persistDevice(state.device.id, state.device.name);
          }
        },
        handleVitals,
      );
      setConnecting(false);
    },
    [handleVitals, persistDevice, lifeBandState.connectionState, connecting],
  );

  const value = useMemo(
    () => ({
      lifeBandState,
      latestVitals,
      connecting,
      connectLifeBand,
      disconnect,
      reconnectIfKnownDevice,
      connectToDevice,
    }),
    [lifeBandState, latestVitals, connecting, connectLifeBand, disconnect, reconnectIfKnownDevice, connectToDevice],
  );

  return <LifeBandContext.Provider value={value}>{children}</LifeBandContext.Provider>;
};

export const useLifeBand = () => {
  const ctx = useContext(LifeBandContext);
  if (!ctx) throw new Error('useLifeBand must be used within LifeBandProvider');
  return ctx;
};
