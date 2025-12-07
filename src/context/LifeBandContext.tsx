import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { saveAggregatedVitalsSample, saveVitalsSample, subscribeToLatestVitals } from '../services/vitalsService';
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
const AGGREGATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MIN_REASONABLE_EPOCH_MS = 1_577_836_800_000; // Jan 1 2020

type AggregationState = {
  bucketStart: number;
  bucketEnd: number;
  count: number;
  numericSums: Record<string, number>;
  latestSample: VitalsSample;
};

const resolveSampleTimestamp = (sample?: VitalsSample | null) => {
  if (!sample) return 0;
  const candidate =
    typeof sample.lastSampleTimestamp === 'number' && Number.isFinite(sample.lastSampleTimestamp)
      ? sample.lastSampleTimestamp
      : sample.timestamp;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
};

const ensureLastSampleTimestamp = (sample: VitalsSample): VitalsSample => {
  if (typeof sample.lastSampleTimestamp === 'number') {
    return sample;
  }
  return {
    ...sample,
    lastSampleTimestamp: sample.timestamp,
  };
};

export const LifeBandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lifeBandState, setLifeBandState] = useState<LifeBandState>({ connectionState: 'disconnected' });
  const [latestVitals, setLatestVitals] = useState<VitalsSample | null>(null);
  const [connecting, setConnecting] = useState(false);
  const latestSubRef = useRef<(() => void) | undefined>(undefined);
  const isMountedRef = useRef(true); // Track if component is mounted
  const shouldAutoReconnectRef = useRef(false); // Track if auto-reconnect is desired
  const reconnectAttemptRef = useRef(0); // Track reconnection attempts
  const maxReconnectAttempts = 3; // Maximum auto-reconnect attempts
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track reconnection timeout
  const aggregationRef = useRef<AggregationState | null>(null);
  const liveSampleRef = useRef<VitalsSample | null>(null);
  const connectionStateRef = useRef<BleConnectionState>('disconnected');

  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsubscribe;
  }, []);

  // Mark component as mounted/unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      shouldAutoReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      console.log('[CONTEXT] LifeBandProvider unmounting, cleaning up...');
    };
  }, []);

  // Subscribe to latest vitals in Firestore to sync UI even if app restarts
  useEffect(() => {
    if (!uid) return;
    latestSubRef.current?.();
    latestSubRef.current = subscribeToLatestVitals(uid, (sample) => {
      if (!isMountedRef.current) {
        return;
      }

      if (!sample) {
        setLatestVitals(null);
        return;
      }

      const normalizedSample = ensureLastSampleTimestamp(sample);
      
      // Always update with Firestore data to ensure patient and doctor see same values
      console.log('[CONTEXT] Firestore vitals update:', normalizedSample.hr, normalizedSample.timestamp);
      setLatestVitals(normalizedSample);
      liveSampleRef.current = normalizedSample;
    });
    return () => latestSubRef.current?.();
  }, [uid]);

  useEffect(() => {
    connectionStateRef.current = lifeBandState.connectionState;
  }, [lifeBandState.connectionState]);

  useEffect(() => {
    aggregationRef.current = null;
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

  const persistAggregation = useCallback(
    async (state: AggregationState) => {
      if (!uid) return;
      const aggregatedSample: VitalsSample = {
        ...state.latestSample,
        timestamp: state.bucketStart,
        bucketStart: state.bucketStart,
        bucketEnd: state.bucketEnd,
        bucketDurationMs: AGGREGATION_WINDOW_MS,
        sampleCount: state.count,
        aggregated: true,
        lastSampleTimestamp: state.latestSample.timestamp,
      };

      Object.entries(state.numericSums).forEach(([key, sum]) => {
        (aggregatedSample as any)[key] = Number((sum / state.count).toFixed(1));
      });

      await saveAggregatedVitalsSample(uid, state.bucketStart, aggregatedSample);
    },
    [uid],
  );

  const recordAggregatedSample = useCallback(
    (sample: VitalsSample) => {
      if (!uid) return;
      const normalizeTimestamp = (raw?: number) => {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
          return Date.now();
        }
        let ts = raw;
        if (ts < 10_000_000_000) {
          ts *= 1000;
        }
        if (ts < MIN_REASONABLE_EPOCH_MS) {
          return Date.now();
        }
        return ts;
      };

      const timestamp = normalizeTimestamp(sample.timestamp);
      const enrichedSample = { ...sample, timestamp };

      const bucketStart = Math.floor(timestamp / AGGREGATION_WINDOW_MS) * AGGREGATION_WINDOW_MS;
      const bucketEnd = bucketStart + AGGREGATION_WINDOW_MS;

      let current = aggregationRef.current;
      if (!current || current.bucketStart !== bucketStart) {
        current = {
          bucketStart,
          bucketEnd,
          count: 0,
          numericSums: {},
          latestSample: enrichedSample,
        };
      }

      if (!current) {
        return;
      }

      current.count += 1;
      current.latestSample = enrichedSample;

      Object.entries(enrichedSample).forEach(([key, value]) => {
        if (key === 'timestamp') return;
        if (typeof value === 'number' && Number.isFinite(value)) {
          current.numericSums[key] = (current.numericSums[key] || 0) + value;
        }
      });

      aggregationRef.current = current;

      const snapshot: AggregationState = {
        bucketStart: current.bucketStart,
        bucketEnd: current.bucketEnd,
        count: current.count,
        numericSums: { ...current.numericSums },
        latestSample: { ...current.latestSample },
      };

      persistAggregation(snapshot).catch((error: any) => {
        const errorMsg = error?.reason || error?.message || 'Unknown error';
        console.warn('[CONTEXT] Aggregate save failed:', errorMsg);
      });
      
      // Immediately update local state for real-time display
      liveSampleRef.current = enrichedSample;
      setLatestVitals(enrichedSample);
    },
    [persistAggregation, uid],
  );

  const handleVitals = useCallback(
    async (sample: VitalsSample) => {
      // Safety check: don't update state if component unmounted
      if (!isMountedRef.current) {
        console.log('[CONTEXT] Ignoring vitals - component unmounted');
        return;
      }
      
      try {
        const enrichedSample = ensureLastSampleTimestamp(sample);
        console.log('[CONTEXT] Received vitals:', JSON.stringify(enrichedSample));
        liveSampleRef.current = enrichedSample;
        setLatestVitals(enrichedSample);
        
        // Save the raw latest sample immediately for real-time doctor view
        if (uid) {
          saveVitalsSample(uid, enrichedSample).catch((error: any) => {
            console.warn('[CONTEXT] Latest sample save failed:', error?.message || 'Unknown error');
          });
        }
        
        // Persist aggregated vitals snapshot in the background
        recordAggregatedSample(enrichedSample);
      } catch (error: any) {
        const errorMsg = error?.reason || error?.message || 'Unknown error';
        console.error('[CONTEXT] handleVitals error:', errorMsg);
      }
    },
    [recordAggregatedSample, uid],
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
    reconnectAttemptRef.current = 0; // Reset reconnect attempts
    
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
    console.log('[CONTEXT] Disconnect requested');
    
    // Check if component is mounted before proceeding
    if (!isMountedRef.current) {
      console.log('[CONTEXT] Component unmounted, aborting disconnect');
      return;
    }
    
    try {
      // Disable auto-reconnect when user manually disconnects
      shouldAutoReconnectRef.current = false;
      reconnectAttemptRef.current = 0;
      
      // Clear any pending reconnection timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Update state to show disconnecting (optional visual feedback)
      if (isMountedRef.current) {
        setLifeBandState(prev => ({ ...prev, connectionState: 'disconnected' }));
      }
      
      // Perform actual disconnect
      await disconnectLifeBand();
      
      // Confirm disconnected state after successful disconnect
      if (isMountedRef.current) {
        console.log('[CONTEXT] Disconnect successful');
        // Use setTimeout to avoid state update during render
        setTimeout(() => {
          if (isMountedRef.current) {
            setLifeBandState({ connectionState: 'disconnected' });
            setConnecting(false);
          }
        }, 0);
      }
    } catch (error: any) {
      const errorMsg = error?.reason || error?.message || 'Disconnect failed';
      console.error('[CONTEXT] Disconnect error:', errorMsg);
      
      // Update state with error only if still mounted
      if (isMountedRef.current) {
        setTimeout(() => {
          if (isMountedRef.current) {
            setLifeBandState({ 
              connectionState: 'disconnected', 
              lastError: 'Disconnect failed' 
            });
            setConnecting(false);
          }
        }, 0);
      }
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
    
    // Check reconnection attempt limit
    if (reconnectAttemptRef.current >= maxReconnectAttempts) {
      console.log('[CONTEXT] Max reconnect attempts reached, stopping auto-reconnect');
      shouldAutoReconnectRef.current = false;
      reconnectAttemptRef.current = 0;
      
      if (isMountedRef.current) {
        Alert.alert(
          'LifeBand Disconnected',
          'Unable to reconnect to your LifeBand. Please reconnect manually from the LifeBand screen.',
          [{ text: 'OK' }]
        );
      }
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
      
      reconnectAttemptRef.current += 1;
      console.log(`[CONTEXT] Auto-reconnect attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts}`);
      
      setConnecting(true);
      
      await reconnectLifeBandById(
        savedId,
        (state) => {
          // Only update state if component is still mounted
          if (isMountedRef.current) {
            setLifeBandState(state);
            
            // If successfully connected, reset attempt counter
            if (state.connectionState === 'connected') {
              reconnectAttemptRef.current = 0;
              console.log('[CONTEXT] Reconnect successful, reset attempt counter');
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
      
      // If still mounted and connected successfully, reset attempts
      if (isMountedRef.current && lifeBandState.connectionState === 'connected') {
        reconnectAttemptRef.current = 0;
      }
    } catch (error: any) {
      const errorMsg = error?.reason || error?.message || 'Reconnect failed';
      console.error('[CONTEXT] Reconnect error:', errorMsg);
      
      if (isMountedRef.current) {
        setLifeBandState({ connectionState: 'disconnected', lastError: errorMsg });
        
        // If we've reached max attempts, show alert and stop
        if (reconnectAttemptRef.current >= maxReconnectAttempts) {
          shouldAutoReconnectRef.current = false;
          reconnectAttemptRef.current = 0;
          Alert.alert(
            'LifeBand Disconnected',
            'Unable to reconnect to your LifeBand. Please reconnect manually from the LifeBand screen.',
            [{ text: 'OK' }]
          );
        }
      }
    } finally {
      if (isMountedRef.current) {
        setConnecting(false);
      }
    }
  }, [handleVitals, lifeBandState.connectionState]);

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
      reconnectAttemptRef.current = 0; // Reset reconnect attempts
      
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
