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
  const isMountedRef = useRef(true); // Track if component is mounted
  const shouldAutoReconnectRef = useRef(false); // Track if auto-reconnect is desired

  const uid = auth.currentUser?.uid;

  // Mark component as mounted/unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      console.log('[CONTEXT] LifeBandProvider unmounting, cleaning up...');
    };
  }, []);

  // Subscribe to latest vitals in Firestore to sync UI even if app restarts
  useEffect(() => {
    if (!uid) return;
    latestSubRef.current?.();
    latestSubRef.current = subscribeToLatestVitals(uid, (sample) => {
      if (isMountedRef.current) {
        setLatestVitals(sample);
      }
    });
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
      // Safety check: don't update state if component unmounted
      if (!isMountedRef.current) {
        console.log('[CONTEXT] Ignoring vitals - component unmounted');
        return;
      }
      
      try {
        console.log('[CONTEXT] Received vitals:', JSON.stringify(sample));
        setLatestVitals(sample);
        
        // Save to Firestore in background without blocking
        if (uid) {
          saveVitalsSample(uid, sample)
            .then(() => console.log('[CONTEXT] Vitals saved'))
            .catch((error: any) => {
              const errorMsg = error?.reason || error?.message || 'Unknown error';
              console.warn('[CONTEXT] Save failed (non-critical):', errorMsg);
            });
        }
      } catch (error: any) {
        const errorMsg = error?.reason || error?.message || 'Unknown error';
        console.error('[CONTEXT] handleVitals error:', errorMsg);
      }
    },
    [uid],
  );

  const connectLifeBand = useCallback(async () => {
    if (lifeBandState.connectionState === 'connected' || connecting) {
      return;
    }
    
    if (!isMountedRef.current) {
      console.log('[CONTEXT] Component unmounted, aborting connection');
      return;
    }
    
    setConnecting(true);
    shouldAutoReconnectRef.current = true; // Enable auto-reconnect for this connection
    
    try {
      await scanAndConnectToLifeBand(
        (state) => {
          // Only update state if component is still mounted
          if (isMountedRef.current) {
            setLifeBandState(state);
            if (state.connectionState === 'connected' && state.device) {
              persistDevice(state.device.id, state.device.name);
            }
            // If disconnected, clear auto-reconnect flag
            if (state.connectionState === 'disconnected') {
              shouldAutoReconnectRef.current = false;
            }
          } else {
            console.log('[CONTEXT] State update skipped - component unmounted');
          }
        },
        handleVitals,
      );
    } catch (error: any) {
      const errorMsg = error?.reason || error?.message || 'Connection failed';
      console.error('[CONTEXT] Connect error:', errorMsg);
      if (isMountedRef.current) {
        setLifeBandState({ connectionState: 'disconnected', lastError: errorMsg });
      }
      shouldAutoReconnectRef.current = false; // Disable auto-reconnect on error
    } finally {
      if (isMountedRef.current) {
        setConnecting(false);
      }
    }
  }, [handleVitals, persistDevice, lifeBandState.connectionState, connecting]);

  const disconnect = useCallback(async () => {
    try {
      shouldAutoReconnectRef.current = false; // Disable auto-reconnect when user disconnects
      await disconnectLifeBand();
      if (isMountedRef.current) {
        setLifeBandState({ connectionState: 'disconnected' });
      }
    } catch (error: any) {
      const errorMsg = error?.reason || error?.message || 'Disconnect failed';
      console.error('[CONTEXT] Disconnect error:', errorMsg);
    }
  }, []);

  const reconnectIfKnownDevice = useCallback(async () => {
    // Only reconnect if auto-reconnect is enabled and component is mounted
    if (!shouldAutoReconnectRef.current) {
      console.log('[CONTEXT] Auto-reconnect disabled, skipping');
      return;
    }
    
    if (!isMountedRef.current) {
      console.log('[CONTEXT] Component unmounted, aborting reconnect');
      return;
    }
    
    try {
      const savedId = await AsyncStorage.getItem(DEVICE_KEY);
      if (!savedId) {
        console.log('[CONTEXT] No saved device ID, skipping reconnect');
        return;
      }
      
      // Double-check auto-reconnect flag before proceeding
      if (!shouldAutoReconnectRef.current) {
        console.log('[CONTEXT] Auto-reconnect disabled during check, aborting');
        return;
      }
      
      setConnecting(true);
      
      await reconnectLifeBandById(
        savedId,
        (state) => {
          // Only update state if component is still mounted
          if (isMountedRef.current) {
            setLifeBandState(state);
            // If disconnected, clear auto-reconnect flag
            if (state.connectionState === 'disconnected') {
              shouldAutoReconnectRef.current = false;
            }
          } else {
            console.log('[CONTEXT] State update skipped - component unmounted');
          }
        },
        handleVitals,
      );
    } catch (error: any) {
      const errorMsg = error?.reason || error?.message || 'Reconnect failed';
      console.error('[CONTEXT] Reconnect error:', errorMsg);
      if (isMountedRef.current) {
        setLifeBandState({ connectionState: 'disconnected', lastError: errorMsg });
      }
      shouldAutoReconnectRef.current = false; // Disable auto-reconnect on error
    } finally {
      if (isMountedRef.current) {
        setConnecting(false);
      }
    }
  }, [handleVitals]);

  const connectToDevice = useCallback(
    async (deviceId: string) => {
      if (lifeBandState.connectionState === 'connected' || connecting) {
        return;
      }
      
      if (!isMountedRef.current) {
        console.log('[CONTEXT] Component unmounted, aborting device connection');
        return;
      }
      
      setConnecting(true);
      shouldAutoReconnectRef.current = true; // Enable auto-reconnect for this connection
      
      try {
        await reconnectLifeBandById(
          deviceId,
          (state) => {
            // Only update state if component is still mounted
            if (isMountedRef.current) {
              setLifeBandState(state);
              if (state.connectionState === 'connected' && state.device) {
                persistDevice(state.device.id, state.device.name);
              }
              // If disconnected, clear auto-reconnect flag
              if (state.connectionState === 'disconnected') {
                shouldAutoReconnectRef.current = false;
              }
            } else {
              console.log('[CONTEXT] State update skipped - component unmounted');
            }
          },
          handleVitals,
        );
      } catch (error: any) {
        const errorMsg = error?.reason || error?.message || 'Device connection failed';
        console.error('[CONTEXT] Connect to device error:', errorMsg);
        if (isMountedRef.current) {
          setLifeBandState({ connectionState: 'disconnected', lastError: errorMsg });
        }
        shouldAutoReconnectRef.current = false; // Disable auto-reconnect on error
      } finally {
        if (isMountedRef.current) {
          setConnecting(false);
        }
      }
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
